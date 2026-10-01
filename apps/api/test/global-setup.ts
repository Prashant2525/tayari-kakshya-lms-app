import { config } from 'dotenv';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Applies all migrations to the test database once per test run. */
export default function setup(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  config({ path: path.resolve(here, '../../../.env'), quiet: true });
  const url = process.env['TEST_DATABASE_URL'];
  if (!url) throw new Error('TEST_DATABASE_URL must be set for API tests');
  execSync('pnpm exec prisma migrate deploy', {
    cwd: path.resolve(here, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
