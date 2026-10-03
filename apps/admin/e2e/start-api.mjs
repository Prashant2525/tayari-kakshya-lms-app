// Prepares the admin *_e2e database and starts the built API on it (Playwright webServer).
import { startE2eApi } from '@tk/e2e-support/start-api';
import { e2eEnv } from './e2e-env.mjs';

await startE2eApi(e2eEnv);
