// Serves the built website (`pnpm build`) against the E2E API, as in production: `next start`.
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_API_ORIGIN, E2E_WEB_ORIGIN, E2E_WEB_PORT } from './constants.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Each run starts from a fresh database: catalog answers cached by an earlier run (60 s) must not be served.
rmSync(path.join(appDir, '.next', 'cache', 'fetch-cache'), { recursive: true, force: true });
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--port', String(E2E_WEB_PORT)],
  {
    cwd: appDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      API_BASE_URL: E2E_API_ORIGIN,
      API_PUBLIC_URL: E2E_API_ORIGIN,
      PUBLIC_WEB_URL: E2E_WEB_ORIGIN,
    },
  },
);
const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
