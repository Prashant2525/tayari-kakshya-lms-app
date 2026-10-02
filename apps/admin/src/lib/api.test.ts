import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, errorMessage, refreshSession, setAccessToken, setSessionLostHandler } from './api';

function json(status: number, body: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    setAccessToken(null);
    setSessionLostHandler(null);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the admin client header, credentials and bearer token', async () => {
    setAccessToken('token-1');
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await api.get('/me');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/me');
    expect(init?.credentials).toBe('include');
    expect(init?.headers).toMatchObject({ 'X-TK-Client': 'admin', Authorization: 'Bearer token-1' });
  });

  it('sends uploads as multipart without forcing a JSON content type', async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: 'm1' }));
    const form = new FormData();
    form.append('visibility', 'public');
    await api.upload('/admin/media', form);
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.body).toBe(form);
    expect(init.headers).not.toHaveProperty('Content-Type');
  });

  it('drops empty query parameters', async () => {
    fetchMock.mockResolvedValueOnce(json(200, []));
    await api.get('/admin/users', { q: '', status: undefined, limit: 25 });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/admin/users?limit=25');
  });

  it('refreshes once on 401 and retries the original request', async () => {
    setAccessToken('expired');
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } }))
      .mockResolvedValueOnce(json(200, { accessToken: 'fresh' }))
      .mockResolvedValueOnce(json(200, { id: 'me' }));
    await expect(api.get('/me')).resolves.toEqual({ id: 'me' });
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/v1/admin/auth/refresh');
    expect(fetchMock.mock.calls[2]![1]?.headers).toMatchObject({ Authorization: 'Bearer fresh' });
  });

  it('shares a single refresh between concurrent callers', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const a = refreshSession();
    const b = refreshSession();
    resolve(json(200, { accessToken: 'shared' }));
    await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a lost session when the refresh fails', async () => {
    const lost = vi.fn();
    setSessionLostHandler(lost);
    setAccessToken('expired');
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } }))
      .mockResolvedValueOnce(json(401, { error: { code: 'REFRESH_TOKEN_INVALID', message: 'no' } }));
    await expect(api.get('/me')).rejects.toBeInstanceOf(ApiError);
    expect(lost).toHaveBeenCalledOnce();
  });

  it('turns API errors into ApiError with code, details and request id', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'bad',
          details: [{ path: 'email', message: 'Invalid' }],
          requestId: 'r1',
        },
      }),
    );
    const err = await api.post('/x', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', requestId: 'r1' });
    expect(errorMessage(err)).toBe('email: Invalid');
  });

  it('gives friendly messages for rate limits and network failures', () => {
    expect(errorMessage(new ApiError(429, 'RATE_LIMITED', 'x'))).toMatch(/Too many attempts/);
    expect(errorMessage(new TypeError('Failed to fetch'))).toMatch(/Cannot reach the server/);
  });
});
