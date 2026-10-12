// Starts the built API on a throw-away load-test database (tayari_kakshya_load_e2e, port 4040) for weekly-exam.mjs.
// Never points at a real database: the e2e start-up refuses names that do not end in _e2e and resets the database.
//   pnpm --filter @tk/api build && node apps/api/scripts/load/start-api.mjs
import { createE2eEnv } from '../../../../packages/e2e-support/src/env.mjs';
import { startE2eApi } from '../../../../packages/e2e-support/src/start-api.mjs';

const PORT = 4040;
await startE2eApi({
  ...createE2eEnv({ name: 'load', apiPort: PORT, webOrigin: `http://localhost:${PORT}`, redisDb: 11 }),
  EMAIL_PROVIDER: 'log',
  // Each simulated student sends its own address (X-Forwarded-For), as real students have their own.
  TRUST_PROXY: 'true',
  LOG_LEVEL: 'error',
});
