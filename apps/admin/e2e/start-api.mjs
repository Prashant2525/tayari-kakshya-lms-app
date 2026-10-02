// Prepares the *_e2e database (create, migrate, reset + seed) and starts the built API on it.
// Invoked by playwright.config.ts as a webServer, which Playwright starts before any test runs.
import { execFileSync, execSync, spawn } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { apiDir, e2eEnv } from './e2e-env.mjs';

const target = new URL(e2eEnv.DATABASE_URL);
const dbName = target.pathname.slice(1);
const admin = new URL(target);
admin.pathname = '/postgres';

const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
await client.end();

execSync('pnpm exec prisma migrate deploy', { cwd: apiDir, env: e2eEnv, stdio: 'inherit' });
execFileSync(process.execPath, [path.join(apiDir, 'dist/scripts/e2e-seed.js')], {
  env: e2eEnv,
  stdio: 'inherit',
});

const child = spawn(process.execPath, [path.join(apiDir, 'dist/main.js')], { env: e2eEnv, stdio: 'inherit' });
const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
