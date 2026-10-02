import type { ApiErrorBody } from '@tk/contracts';

/**
 * Admin API client.
 * - Access token lives only in memory; the refresh token is an HttpOnly cookie the browser sends to
 *   `/api/v1/admin/auth/*` (credentials: 'include').
 * - Every request carries `X-TK-Client: admin` (required by the API's CSRF defence on cookie endpoints).
 * - On 401 the client refreshes once (single-flight) and retries the request.
 */
const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function hasAccessToken(): boolean {
  return accessToken !== null;
}

/** Called when a refresh fails while the user believed they were signed in. */
export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler;
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  body?: unknown;
  query?: Query;
  /** Skip the automatic refresh-and-retry (used by the auth endpoints themselves). */
  noRetry?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Query): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  }
  const suffix = qs.toString();
  return `${BASE}${path}${suffix ? `?${suffix}` : ''}`;
}

async function parse(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function send(method: string, path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { 'X-TK-Client': 'admin', Accept: 'application/json' };
  // FormData sets its own multipart boundary header.
  const isForm = opts.body instanceof FormData;
  if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  return fetch(buildUrl(path, opts.query), {
    method,
    headers,
    body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    credentials: 'include',
    signal: opts.signal,
  });
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await send(method, path, opts);
  if (res.status === 401 && !opts.noRetry && accessToken) {
    const ok = await refreshSession();
    if (!ok) {
      onSessionLost?.();
    } else {
      res = await send(method, path, opts);
    }
  }
  const data = await parse(res);
  if (!res.ok) {
    const err = (data as ApiErrorBody | undefined)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'INTERNAL_ERROR',
      err?.message ?? `Request failed (${res.status})`,
      err?.details,
      err?.requestId,
    );
  }
  return data as T;
}

/** Exchanges the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await send('POST', '/admin/auth/refresh', { noRetry: true });
      if (!res.ok) {
        accessToken = null;
        return false;
      }
      const data = (await parse(res)) as { accessToken: string };
      accessToken = data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'body'> = {}) =>
    request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, { body }),
  /** multipart/form-data upload (media library). */
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, { body: form }),
};

/** Human-friendly message for an error from the API or the network. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError) {
    if (error.code === 'RATE_LIMITED') return 'Too many attempts. Please wait a moment and try again.';
    if (error.code === 'VALIDATION_FAILED' && Array.isArray(error.details) && error.details.length > 0) {
      const first = error.details[0] as { path?: string; message?: string };
      return first.path ? `${first.path}: ${first.message}` : (first.message ?? error.message);
    }
    return error.message;
  }
  if (error instanceof TypeError) return 'Cannot reach the server. Check your connection.';
  return fallback;
}
