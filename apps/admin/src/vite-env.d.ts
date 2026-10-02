/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin for production builds (empty in development: the Vite dev server proxies /api). */
  readonly VITE_API_URL?: string;
}
