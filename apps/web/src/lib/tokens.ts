/**
 * The student's session on the website (T-053). The API's tokens live only in HttpOnly cookies set by this server —
 * page scripts never see them. The access token is short-lived; the refresh token rotates on every use and the API
 * revokes the session if a used one comes back (reuse detection), so refreshing goes through `refreshOnce`.
 */
export const COOKIE = {
  access: 'tk_at',
  refresh: 'tk_rt',
  /** Random id for this browser (the API's device list and limit, D-028). */
  device: 'tk_did',
  locale: 'tk_locale',
} as const;

export interface AuthTokens {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

/** Refresh when the access token has less than this left (or is missing). */
export const REFRESH_MARGIN_MS = 60_000;

/** Reads the expiry of a JWT without verifying it (the API verifies; this only decides when to refresh). */
export function jwtExpiresAt(token: string | undefined): number | null {
  if (!token) return null;
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function needsRefresh(accessToken: string | undefined, now = Date.now()): boolean {
  const exp = jwtExpiresAt(accessToken);
  return exp === null || exp - now < REFRESH_MARGIN_MS;
}

/** Resolves to new tokens, or null when the API refuses the refresh token (signed out); throws when unreachable. */
type Refresher = (refreshToken: string) => Promise<AuthTokens | null>;

/** Recent refreshes by the refresh token they used: in flight, or finished a moment ago. */
const recent = new Map<string, { at: number; result: Promise<AuthTokens | null> }>();
/** A request that started with the old cookie a little before the new one arrived still gets the new tokens. */
const KEEP_MS = 30_000;

/**
 * Uses a refresh token at most once in this process: requests that arrive together (a page and its prefetches) or
 * shortly after with the same old cookie share one refresh instead of tripping the API's reuse detection. (One
 * website process per deployment; several would need a shared store — see T-053.)
 */
export function refreshOnce(
  refreshToken: string,
  refresh: Refresher,
  now = Date.now(),
): Promise<AuthTokens | null> {
  for (const [key, entry] of recent) if (now - entry.at > KEEP_MS) recent.delete(key);
  const hit = recent.get(refreshToken);
  if (hit) return hit.result;
  const result = refresh(refreshToken);
  recent.set(refreshToken, { at: now, result });
  // The API could not be reached: nothing was used up, so the next request may try again.
  result.catch(() => recent.delete(refreshToken));
  return result;
}

interface CookieWriter {
  set(
    name: string,
    value: string,
    options: { httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: string; expires: Date },
  ): unknown;
}

/**
 * Stores the tokens in HttpOnly cookies. SameSite=Lax so the session survives the return from eSewa / Khalti (a
 * top-level navigation from their site); form posts from other sites are refused by Next.js's Origin check.
 */
export function writeTokenCookies(jar: CookieWriter, tokens: AuthTokens, secure: boolean) {
  const base = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };
  jar.set(COOKIE.access, tokens.accessToken, { ...base, expires: new Date(tokens.accessTokenExpiresAt) });
  jar.set(COOKIE.refresh, tokens.refreshToken, { ...base, expires: new Date(tokens.refreshTokenExpiresAt) });
}

/** For tests. */
export function forgetRefreshes() {
  recent.clear();
}
