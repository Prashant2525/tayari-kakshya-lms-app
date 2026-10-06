import 'server-only';

const trim = (v: string) => v.replace(/\/+$/, '');

/**
 * Server-side settings (never sent to the browser). Locally they come from the repository's root `.env` (the dev and
 * start scripts load it); in production from the container's environment.
 */
export const serverEnv = {
  /** How this server reaches the API, e.g. http://api:4000 inside Docker. */
  apiUrl: `${trim(process.env['API_BASE_URL'] || 'http://localhost:4000')}/api/v1`,
  /** How a student's browser reaches the API (receipt links point there). */
  apiPublicUrl: `${trim(process.env['API_PUBLIC_URL'] || process.env['API_BASE_URL'] || 'http://localhost:4000')}/api/v1`,
  /** This website's public address (canonical links, sitemap). */
  siteUrl: trim(process.env['PUBLIC_WEB_URL'] || 'http://localhost:3000'),
  /** Cookies are Secure whenever the site is served over https. */
  secureCookies: (process.env['PUBLIC_WEB_URL'] ?? '').startsWith('https://'),
};
