/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin for production builds (empty in development: the Vite dev server proxies /api). */
  readonly VITE_API_URL?: string;
  /** Sentry DSN of the admin project; error monitoring is off while empty (T-042). */
  readonly VITE_SENTRY_DSN?: string;
  /** Sentry environment for builds (`staging`, `production`); development builds report `development`. */
  readonly VITE_APP_ENV?: string;
  /** Release name (e.g. the git commit) to group errors by deployment. */
  readonly VITE_APP_RELEASE?: string;
}
