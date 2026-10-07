import type { AuthTokens } from '@tk/contracts';

/** An error from the API (`{ error: { code, message, details } }`) or the network (`code: 'NETWORK'`). */
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
}

export const NETWORK_ERROR = 'NETWORK';

export interface TokenStore {
  get(): AuthTokens | null;
  set(tokens: AuthTokens | null): Promise<void>;
}

export interface ApiClientOptions {
  /** e.g. `https://api.example.com/api/v1`, or `/api/v1` for same-origin web builds. */
  baseUrl: string;
  tokens: TokenStore;
  /** Static headers sent with every request (platform, app version, language). */
  headers: () => Record<string, string>;
  /** Called once when the session cannot be refreshed (tokens are already cleared). */
  onSessionEnded: (reason: string) => void;
  /** Called when the server reports maintenance mode, so the app can re-check its config. */
  onMaintenance?: () => void;
  /** Applied to each successful response body before parsing (development: local picture addresses). */
  rewriteResponse?: ((text: string) => string) | null;
  fetch?: typeof fetch;
}

export interface RequestOptions {
  body?: unknown;
  /** Send the access token (default true). */
  auth?: boolean;
  signal?: AbortSignal;
}

/** Codes after which the stored session is useless and the user must sign in again. */
const SESSION_ENDED = new Set([
  'REFRESH_TOKEN_INVALID',
  'REFRESH_TOKEN_REUSED',
  'UNAUTHENTICATED',
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_DELETED',
]);

export function createApiClient(options: ApiClientOptions) {
  const doFetch = options.fetch ?? fetch;
  let refreshing: Promise<boolean> | null = null;

  async function send(method: string, path: string, opts: RequestOptions, token: string | null) {
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers() };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      return await doFetch(`${options.baseUrl}${path}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: opts.signal,
      });
    } catch (cause) {
      if (opts.signal?.aborted) throw cause;
      throw new ApiError(0, NETWORK_ERROR, 'Network request failed');
    }
  }

  async function toError(res: Response): Promise<ApiError> {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string; details?: unknown };
    } | null;
    const code = body?.error?.code ?? (res.status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN');
    if (code === 'MAINTENANCE_MODE') options.onMaintenance?.();
    return new ApiError(res.status, code, body?.error?.message ?? res.statusText, body?.error?.details);
  }

  /** Exchanges the refresh token once, however many requests are waiting on it (single flight). */
  function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      const current = options.tokens.get();
      if (!current) return false;
      const res = await send('POST', '/auth/refresh', { body: { refreshToken: current.refreshToken } }, null);
      if (res.ok) {
        await options.tokens.set((await res.json()) as AuthTokens);
        return true;
      }
      const error = await toError(res);
      if (SESSION_ENDED.has(error.code) || res.status === 401) {
        await options.tokens.set(null);
        options.onSessionEnded(error.code);
        return false;
      }
      throw error;
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const useAuth = opts.auth !== false;
    let token = useAuth ? (options.tokens.get()?.accessToken ?? null) : null;
    // Refresh early when the access token has already expired (saves a failed round trip).
    if (useAuth && token && isExpired(options.tokens.get()?.accessTokenExpiresAt)) {
      token = (await refresh()) ? (options.tokens.get()?.accessToken ?? null) : null;
      if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Session ended');
    }
    let res = await send(method, path, opts, token);
    if (res.status === 401 && useAuth && token) {
      const error = await toError(res);
      if (error.code !== 'TOKEN_EXPIRED' && error.code !== 'UNAUTHENTICATED') throw error;
      if (!(await refresh())) throw error;
      res = await send(method, path, opts, options.tokens.get()?.accessToken ?? null);
    }
    if (!res.ok) throw await toError(res);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(options.rewriteResponse ? options.rewriteResponse(text) : text) as T;
  }

  return {
    request,
    get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
    post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
      request<T>('POST', path, { ...opts, body }),
    put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
      request<T>('PUT', path, { ...opts, body }),
    patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
      request<T>('PATCH', path, { ...opts, body }),
    delete: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Treat a token as expired 30 s early, so requests do not race its expiry. */
function isExpired(iso: string | undefined, now = Date.now()): boolean {
  return iso ? Date.parse(iso) - 30_000 <= now : false;
}
