// Student app browser E2E: its own API, database (<base>_mobile_e2e) and Redis DB, so it can run beside the admin suite.
import { createE2eEnv } from '@tk/e2e-support/env';
import { E2E_API_PORT, E2E_WEB_ORIGIN } from './constants.mjs';

export const e2eEnv = createE2eEnv({
  name: 'mobile',
  apiPort: E2E_API_PORT,
  webOrigin: E2E_WEB_ORIGIN,
  redisDb: 13,
  email: 'smtp',
});
