import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetRefreshes, jwtExpiresAt, needsRefresh, refreshOnce, type AuthTokens } from './tokens';

const jwt = (exp: number) =>
  `h.${Buffer.from(JSON.stringify({ sub: 'u', exp: Math.floor(exp / 1000) })).toString('base64url')}.s`;
const tokens = (n: number): AuthTokens => ({
  accessToken: `access-${n}`,
  accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
  refreshToken: `refresh-${n}`,
  refreshTokenExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
});

beforeEach(() => forgetRefreshes());

describe('website session (T-053)', () => {
  it('refreshes when the access token is missing, unreadable or about to run out', () => {
    const now = Date.UTC(2026, 9, 7, 6, 0, 0);
    expect(needsRefresh(undefined, now)).toBe(true);
    expect(needsRefresh('not-a-jwt', now)).toBe(true);
    expect(needsRefresh(jwt(now + 30_000), now)).toBe(true);
    expect(needsRefresh(jwt(now + 10 * 60_000), now)).toBe(false);
    expect(jwtExpiresAt(jwt(now + 60_000))).toBe(now + 60_000);
  });

  it('uses a refresh token once: requests together, or shortly after, share the same new tokens', async () => {
    let calls = 0;
    const refresh = vi.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return tokens(calls);
    });
    const now = Date.now();
    const [a, b, c] = await Promise.all([
      refreshOnce('rt-1', refresh, now),
      refreshOnce('rt-1', refresh, now),
      refreshOnce('rt-1', refresh, now),
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    // A request that still carried the old cookie a few seconds later gets the same answer (no reuse at the API).
    expect(await refreshOnce('rt-1', refresh, now + 5_000)).toEqual(a);
    expect(refresh).toHaveBeenCalledTimes(1);
    // Long after, the old token is no longer remembered.
    await refreshOnce('rt-1', refresh, now + 60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('a refused refresh signs out; an unreachable API can be tried again', async () => {
    const refused = vi.fn(async () => null);
    expect(await refreshOnce('rt-2', refused)).toBeNull();
    const down = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(refreshOnce('rt-3', down)).rejects.toThrow('ECONNREFUSED');
    await new Promise((r) => setTimeout(r, 0));
    const fresh = tokens(9);
    const up = vi.fn(async () => fresh);
    expect(await refreshOnce('rt-3', up)).toBe(fresh);
  });
});
