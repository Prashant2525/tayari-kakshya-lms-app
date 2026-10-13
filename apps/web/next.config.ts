import type { NextConfig } from 'next';

/**
 * The public website (D-004, T-015). It talks to the API from the server only (API_INTERNAL_URL); the browser never
 * holds the student's tokens (HttpOnly cookies, see src/lib/session.ts).
 */
const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // Workspace packages are built to dist/ (ESM); Next resolves them like any dependency.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // The Content-Security-Policy (with a nonce per page, R-3) is set by src/proxy.ts.
        ],
      },
    ];
  },
};

export default config;
