import type { AuthTokens } from '@tk/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, NETWORK_ERROR } from './api-client';

const future = (s: number) => new Date(Date.now() + s * 1000).toISOString();
const tokens = (n: number, expiresIn = 600): AuthTokens => ({
  accessToken: `access-${n}`,
  accessTokenExpiresAt: future(expiresIn),
  refreshToken: `refresh-${n}-padding-to-20-chars`,
  refreshTokenExpiresAt: future(86_400),
  sessionId: '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b',
});
const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const apiError = (status: number, code: string, details?: unknown) =>
  json(status, { error: { code, message: code, details } });

function setup(
  initial: AuthTokens | null,
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  let current = initial;
  const ended = vi.fn();
  const maintenance = vi.fn();
  const fetch = vi.fn(async (url: string, init: RequestInit) => handler(url, init));
  const client = createApiClient({
    baseUrl: 'https://api.test/api/v1',
    tokens: {
      get: () => current,
      set: async (t) => {
        current = t;
      },
    },
    headers: () => ({ 'X-TK-Platform': 'android' }),
    onSessionEnded: ended,
    onMaintenance: maintenance,
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
  return { client, fetch, ended, maintenance, tokens: () => current };
}

const auth = (init: RequestInit) => (init.headers as Record<string, string>)['Authorization'];

describe('API client', () => {
  it('sends JSON with the platform header and bearer token', async () => {
    const { client, fetch } = setup(tokens(1), () => json(200, { ok: true }));
    await expect(client.post('/things', { a: 1 })).resolves.toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/v1/things');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({
      'X-TK-Platform': 'android',
      'Content-Type': 'application/json',
      Authorization: 'Bearer access-1',
    });
  });

  it('omits the token for public calls and returns undefined for 204', async () => {
    const { client, fetch } = setup(tokens(1), () => new Response(null, { status: 204 }));
    await expect(client.post('/auth/password/forgot', {}, { auth: false })).resolves.toBeUndefined();
    expect(auth(fetch.mock.calls[0]?.[1] as RequestInit)).toBeUndefined();
  });

  it('turns error bodies into ApiError with code and details', async () => {
    const { client } = setup(null, () => apiError(409, 'DEVICE_LIMIT_REACHED', { maxActiveSessions: 2 }));
    const error = await client.post('/auth/login', {}, { auth: false }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'DEVICE_LIMIT_REACHED',
      details: { maxActiveSessions: 2 },
    });
  });

  it('reports network failures as NETWORK errors', async () => {
    const { client } = setup(null, () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(client.get('/app/config', { auth: false })).rejects.toMatchObject({
      code: NETWORK_ERROR,
      status: 0,
    });
  });

  it('refreshes once for concurrent expired requests, then retries each with the new token', async () => {
    let refreshes = 0;
    const { client, tokens: current } = setup(tokens(1), async (url, init) => {
      if (url.endsWith('/auth/refresh')) {
        refreshes++;
        await new Promise((r) => setTimeout(r, 10));
        return json(200, tokens(2));
      }
      return auth(init) === 'Bearer access-2' ? json(200, { url }) : apiError(401, 'TOKEN_EXPIRED');
    });
    const results = await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')]);
    expect(results).toEqual([
      { url: 'https://api.test/api/v1/a' },
      { url: 'https://api.test/api/v1/b' },
      { url: 'https://api.test/api/v1/c' },
    ]);
    expect(refreshes).toBe(1);
    expect(current()?.accessToken).toBe('access-2');
  });

  it('refreshes before sending when the stored access token has already expired', async () => {
    const seen: string[] = [];
    const { client } = setup(tokens(1, -5), (url, init) => {
      seen.push(url.endsWith('/auth/refresh') ? 'refresh' : `${auth(init)}`);
      return url.endsWith('/auth/refresh') ? json(200, tokens(2)) : json(200, {});
    });
    await client.get('/me');
    expect(seen).toEqual(['refresh', 'Bearer access-2']);
  });

  it('ends the session when the refresh token is rejected', async () => {
    const {
      client,
      ended,
      tokens: current,
    } = setup(tokens(1), (url) =>
      url.endsWith('/auth/refresh') ? apiError(401, 'REFRESH_TOKEN_REUSED') : apiError(401, 'TOKEN_EXPIRED'),
    );
    await expect(client.get('/me')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(ended).toHaveBeenCalledWith('REFRESH_TOKEN_REUSED');
    expect(current()).toBeNull();
  });

  it('does not refresh on 403 and reports maintenance mode', async () => {
    const { client, fetch, maintenance } = setup(tokens(1), (url) =>
      url.endsWith('/locked') ? apiError(403, 'CONTENT_LOCKED') : apiError(503, 'MAINTENANCE_MODE'),
    );
    await expect(client.get('/locked')).rejects.toMatchObject({ code: 'CONTENT_LOCKED' });
    await expect(client.get('/me')).rejects.toMatchObject({ code: 'MAINTENANCE_MODE' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(maintenance).toHaveBeenCalledTimes(1);
  });
});
