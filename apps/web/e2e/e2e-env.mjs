// Website browser E2E: its own API, database (<base>_web_e2e) and Redis DB, so it can run beside the other suites.
import { createE2eEnv } from '@tk/e2e-support/env';
import { E2E_API_ORIGIN, E2E_API_PORT, E2E_WEB_ORIGIN } from './constants.mjs';

const base = createE2eEnv({
  name: 'web',
  apiPort: E2E_API_PORT,
  webOrigin: E2E_WEB_ORIGIN,
  // Unlike the CMS and the app's test server, the website does not proxy /api: browsers reach the API directly.
  apiOrigin: E2E_API_ORIGIN,
  redisDb: 12,
  email: 'smtp',
});

/**
 * Access tokens last 60 s here (the shortest the API allows), inside the website's refresh margin: every page load
 * refreshes the session, so the suite exercises the single-use refresh path (T-053) — parallel requests, prefetches
 * and the return from the payment gateway — on every step.
 */
export const e2eEnv = { ...base, JWT_ACCESS_TTL_SECONDS: '60' };
