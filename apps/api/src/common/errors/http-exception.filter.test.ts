import type { ArgumentsHost } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ErrorCode } from '@tk/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from './app-error.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

function run(exception: unknown) {
  const sent: { status?: number; body?: unknown } = {};
  const reply = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    send(body: unknown) {
      sent.body = body;
      return this;
    },
    headers() {
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => reply, getRequest: () => ({ id: 'req-1', url: '/x' }) }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return sent;
}

describe('HttpExceptionFilter logging', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs deliberate 5xx AppErrors as warnings without a stack, keeping their code', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const sent = run(
      new AppError(503, ErrorCode.VIDEO_PROVIDER_NOT_CONFIGURED, 'Bunny Stream is not configured yet'),
    );
    expect(sent.status).toBe(503);
    expect(sent.body).toMatchObject({ error: { code: 'VIDEO_PROVIDER_NOT_CONFIGURED', requestId: 'req-1' } });
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VIDEO_PROVIDER_NOT_CONFIGURED', status: 503 }),
      'Bunny Stream is not configured yet',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('stack');
  });

  it('logs unexpected exceptions as errors and hides their message from the client', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const sent = run(new Error('database password is wrong'));
    expect(sent.status).toBe(500);
    expect(sent.body).toMatchObject({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    expect(JSON.stringify(sent.body)).not.toContain('password');
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.any(String),
    );
  });

  it('does not log client errors', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    expect(run(new AppError(403, ErrorCode.CONTENT_LOCKED, 'Locked')).status).toBe(403);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
