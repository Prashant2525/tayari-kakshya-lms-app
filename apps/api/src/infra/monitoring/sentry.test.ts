import type { ArgumentsHost } from '@nestjs/common';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpExceptionFilter } from '../../common/errors/http-exception.filter.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '@tk/contracts';
import { loadEnv } from '../../config/env.js';
import { flushMonitoring, initMonitoring, reportError, scrubEvent } from './sentry.js';

/** A stand-in Sentry ingest endpoint: records every envelope the SDK sends. */
let server: Server;
const envelopes: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
    req.on('end', () => {
      envelopes.push(body);
      res.writeHead(200).end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Runs the API's error filter as Nest would for one request. */
function handle(exception: unknown) {
  const sent: { status?: number; body?: unknown } = {};
  const reply = {
    headers: () => reply,
    status: (s: number) => ((sent.status = s), reply),
    send: (b: unknown) => ((sent.body = b), reply),
  };
  const request = {
    id: 'req-42',
    method: 'POST',
    url: '/api/v1/auth/login?token=secret-query',
    routeOptions: { url: '/api/v1/auth/login' },
    headers: { authorization: 'Bearer secret-token', cookie: 'sid=secret-cookie' },
    body: { email: 'student@example.com', password: 'secret-password' },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => reply, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return sent;
}

describe('error monitoring', () => {
  it('sends nothing while no DSN is configured', () => {
    expect(initMonitoring(loadEnv(), 'api')).toBe(false);
  });

  it('reports unexpected errors with the request id and route, and no personal data', async () => {
    const { port } = server.address() as AddressInfo;
    const env = loadEnv({ ...process.env, SENTRY_DSN_API: `http://publickey@127.0.0.1:${port}/1` });
    expect(initMonitoring(env, 'api')).toBe(true);

    // Deliberate operational errors and client errors are not reported.
    handle(new AppError(503, ErrorCode.VIDEO_PROVIDER_NOT_CONFIGURED, 'Video provider not configured'));
    handle(new AppError(400, ErrorCode.VALIDATION_FAILED, 'Bad input'));
    const password = 'secret-password';
    const sent = handle(new Error('Database went away'));
    expect(sent.status).toBe(500);
    reportError(new Error('Job exploded'), { job: 'erase-accounts' });
    await flushMonitoring();

    const all = envelopes.join('\n');
    expect(all).toContain('Database went away');
    expect(all).toContain('"request_id":"req-42"');
    expect(all).toContain('"route":"/api/v1/auth/login"');
    expect(all).toContain('"job":"erase-accounts"');
    expect(all).toContain('"environment":"test"');
    expect(all).not.toContain('Video provider not configured');
    expect(all).not.toContain('Bad input');
    for (const secret of [password, 'secret-token', 'secret-cookie', 'secret-query', 'student@example.com']) {
      expect(all).not.toContain(secret);
    }
  });

  it('strips request data, headers, cookies, query strings and the user from any event', () => {
    const event = scrubEvent({
      type: undefined,
      user: { id: 'u1', email: 'student@example.com', ip_address: '1.2.3.4' },
      breadcrumbs: [{ message: 'POST /auth/login' }],
      request: {
        method: 'POST',
        url: 'https://api.example.com/api/v1/auth/login?token=abc',
        data: { password: 'secret-password' },
        cookies: { sid: 'secret-cookie' },
        query_string: 'token=abc',
        headers: {
          Authorization: 'Bearer x',
          Cookie: 'sid=1',
          'User-Agent': 'TK/1.0',
          'X-TK-Client': 'mobile',
        },
      },
    });
    expect(event.user).toBeUndefined();
    expect(event.breadcrumbs).toBeUndefined();
    expect(event.request).toEqual({
      method: 'POST',
      url: 'https://api.example.com/api/v1/auth/login',
      headers: { 'User-Agent': 'TK/1.0', 'X-TK-Client': 'mobile' },
    });
  });
});
