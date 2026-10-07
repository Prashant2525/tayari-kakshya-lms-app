// Admin CMS browser E2E: API environment from the shared harness (@tk/e2e-support). Test-only values.
import { createE2eEnv } from '@tk/e2e-support/env';

export {
  apiDir,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_EDITOR2_EMAIL,
  E2E_EDITOR3_EMAIL,
  E2E_STUDENT_EMAIL,
  E2E_EDITOR_EMAIL,
} from '@tk/e2e-support/env';

/**
 * The admin under test reports errors to this fake Sentry host (never the real project, even when apps/admin/.env
 * holds the real DSN); monitoring.spec.ts intercepts it to check what would be sent.
 */
export const E2E_SENTRY_HOST = 'https://sentry.e2e.invalid';
export const E2E_SENTRY_DSN = `https://e2epublickey@sentry.e2e.invalid/1`;

export const e2eEnv = createE2eEnv({ apiPort: 4010, webOrigin: 'http://localhost:5174', redisDb: 14 });
