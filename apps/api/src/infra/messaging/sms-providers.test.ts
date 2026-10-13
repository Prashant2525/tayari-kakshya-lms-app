import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AakashSms, nepalMobile, smsProviderFromEnv, SparrowSms } from './sms-providers.js';

/**
 * A local stand-in answering like Sparrow SMS and Aakash SMS, so the real request (method, address, form encoding)
 * is exercised — only the provider's server is replaced.
 */
const seen: Array<{ method: string; path: string; form: Record<string, string> }> = [];
let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://x');
      const form = Object.fromEntries(
        req.method === 'GET' ? url.searchParams : new URLSearchParams(data),
      ) as Record<string, string>;
      seen.push({ method: req.method ?? '', path: url.pathname, form });
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (url.pathname === '/v2/sms/') {
        return form['token'] === 'sparrow-token'
          ? json(200, { count: 1, response_code: 200, response: '1 mesages has been queued for delivery' })
          : json(403, { response_code: 1002, response: 'Invalid Token' });
      }
      if (url.pathname === '/v2/credit/') {
        return form['token'] === 'sparrow-token'
          ? json(200, { credits_available: 420, response_code: 200 })
          : json(403, { response_code: 1002, response: 'Invalid Token' });
      }
      if (url.pathname === '/sms/v3/send') {
        return form['auth_token'] === 'aakash-token'
          ? json(200, { error: false, message: '1 messages has been queued', data: { valid: [form['to']] } })
          : json(200, { error: true, message: 'Invalid token' });
      }
      if (url.pathname === '/sms/v1/credit') {
        return form['auth_token'] === 'aakash-token'
          ? json(200, { error: false, available_credit: 99 })
          : json(200, { error: true, message: 'Invalid token' });
      }
      return json(404, null);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
});

describe('SMS providers (D-076, G-2)', () => {
  it('sends Nepal mobile numbers as 10 digits', () => {
    expect(nepalMobile('+9779812345678')).toBe('9812345678');
    expect(nepalMobile('9779712345678')).toBe('9712345678');
    expect(nepalMobile('9861234567')).toBe('9861234567');
    expect(() => nepalMobile('+15551234567')).toThrow();
    expect(() => nepalMobile('014123456')).toThrow();
  });

  it('Sparrow: token, approved sender, number and text as a form; a refused token is an error', async () => {
    seen.length = 0;
    await new SparrowSms('sparrow-token', 'TayariKaksha', base).send('+9779812345678', 'कोड 123456');
    expect(seen[0]).toEqual({
      method: 'POST',
      path: '/v2/sms/',
      form: { token: 'sparrow-token', from: 'TayariKaksha', to: '9812345678', text: 'कोड 123456' },
    });
    expect(await new SparrowSms('sparrow-token', 'X', base).credit()).toBe('token accepted, 420 credits');
    await expect(new SparrowSms('wrong', 'X', base).send('9812345678', 'x')).rejects.toThrow(/Sparrow/);
    await expect(new SparrowSms('wrong', 'X', base).credit()).rejects.toThrow(/refused the token/);
  });

  it('Aakash: auth token, number and text as a form; error:true is an error', async () => {
    seen.length = 0;
    await new AakashSms('aakash-token', base).send('+9779712345678', 'Code 654321');
    expect(seen[0]).toEqual({
      method: 'POST',
      path: '/sms/v3/send',
      form: { auth_token: 'aakash-token', to: '9712345678', text: 'Code 654321' },
    });
    expect(await new AakashSms('aakash-token', base).credit()).toBe('token accepted, 99 credits');
    await expect(new AakashSms('wrong', base).send('9712345678', 'x')).rejects.toThrow(/Aakash/);
  });

  it('is chosen by SMS_PROVIDER; disabled / log have none', () => {
    expect(smsProviderFromEnv({ SMS_PROVIDER: 'sparrow', SMS_API_KEY: 't', SMS_SENDER_ID: 's' })?.name).toBe(
      'sparrow',
    );
    expect(smsProviderFromEnv({ SMS_PROVIDER: 'aakash', SMS_API_KEY: 't' })?.name).toBe('aakash');
    expect(smsProviderFromEnv({ SMS_PROVIDER: 'log' })).toBeNull();
    expect(smsProviderFromEnv({ SMS_PROVIDER: 'disabled' })).toBeNull();
  });
});
