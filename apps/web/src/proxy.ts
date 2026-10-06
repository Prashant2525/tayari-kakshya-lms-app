import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, needsRefresh, refreshOnce, writeTokenCookies, type AuthTokens } from './lib/tokens';

const API = `${(process.env['API_BASE_URL'] || 'http://localhost:4000').replace(/\/+$/, '')}/api/v1`;
const secure = (process.env['PUBLIC_WEB_URL'] ?? '').startsWith('https://');

/** Asks the API for new tokens: null when it refuses the refresh token, an exception when it cannot be reached. */
async function callRefresh(refreshToken: string, request: NextRequest): Promise<AuthTokens | null> {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const res = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TK-Platform': 'web',
      'User-Agent': request.headers.get('user-agent') ?? 'Tayari Kakshya website',
      ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
    },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Refresh failed with ${res.status}`);
  return (await res.json()) as AuthTokens;
}

/**
 * Before a page renders, renews the student's access token when it is about to run out, so pages and actions always
 * call the API with a valid one (T-053). Server components cannot set cookies, so this is the one place that does it
 * for page loads.
 */
export async function proxy(request: NextRequest) {
  const refresh = request.cookies.get(COOKIE.refresh)?.value;
  if (!refresh || !needsRefresh(request.cookies.get(COOKIE.access)?.value)) return NextResponse.next();

  let tokens: AuthTokens | null;
  try {
    tokens = await refreshOnce(refresh, (rt) => callRefresh(rt, request));
  } catch {
    // The API is unreachable: keep the cookies and let the page show its own error.
    return NextResponse.next();
  }
  if (!tokens) {
    request.cookies.delete(COOKIE.access);
    request.cookies.delete(COOKIE.refresh);
    const res = NextResponse.next({ request: { headers: request.headers } });
    res.cookies.delete(COOKIE.access);
    res.cookies.delete(COOKIE.refresh);
    return res;
  }
  // This request continues with the new tokens; the browser stores them for the next ones.
  request.cookies.set(COOKIE.access, tokens.accessToken);
  request.cookies.set(COOKIE.refresh, tokens.refreshToken);
  const res = NextResponse.next({ request: { headers: request.headers } });
  writeTokenCookies(res.cookies, tokens, secure);
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|fonts/).*)'],
};
