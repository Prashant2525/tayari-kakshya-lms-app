import 'server-only';
import { cookies, headers } from 'next/headers';
import { serverEnv } from './env';
import { COOKIE } from './tokens';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get reason(): string | undefined {
    return (this.details as { reason?: string } | undefined)?.reason;
  }
}

interface CallOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Send the signed-in student's token when there is one (default true). */
  auth?: boolean;
  /** Seconds a public answer may be reused for (catalog pages); private answers are never cached. */
  revalidate?: number;
}

/**
 * Calls the API from this server. Every call says it comes from the website (`X-TK-Platform: web`: what can be sold
 * here, D-027) and passes on the student's address and browser so the API's rate limits and device list see the
 * student, not this server (the API must trust this server as a proxy: TRUST_PROXY).
 */
export async function api<T>(path: string, opts: CallOptions = {}): Promise<T> {
  const jar = await cookies();
  const incoming = await headers();
  const token = opts.auth === false ? undefined : jar.get(COOKIE.access)?.value;
  const forwardedFor = incoming.get('x-forwarded-for') ?? incoming.get('x-real-ip');
  const res = await fetch(`${serverEnv.apiUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'X-TK-Platform': 'web',
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {}),
      'User-Agent': incoming.get('user-agent') ?? 'Tayari Kakshya website',
      'Accept-Language': jar.get(COOKIE.locale)?.value ?? 'en',
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    ...(opts.revalidate !== undefined && !token
      ? { next: { revalidate: opts.revalidate } }
      : { cache: 'no-store' as const }),
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as
    (T & { error?: undefined }) | { error?: { code?: string; message?: string; details?: unknown } } | null;
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'HTTP_ERROR', e?.message ?? `API ${res.status}`, e?.details);
  }
  return json as T;
}

/** Whether the student is signed in (has a session cookie; the API decides whether it is still valid). */
export async function signedIn(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(jar.get(COOKIE.access)?.value || jar.get(COOKIE.refresh)?.value);
}
