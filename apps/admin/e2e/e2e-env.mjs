// Admin CMS browser E2E: API environment from the shared harness (@tk/e2e-support). Test-only values.
import { createE2eEnv } from '@tk/e2e-support/env';

export { apiDir, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_EDITOR_EMAIL } from '@tk/e2e-support/env';

export const e2eEnv = createE2eEnv({ apiPort: 4010, webOrigin: 'http://localhost:5174', redisDb: 14 });
