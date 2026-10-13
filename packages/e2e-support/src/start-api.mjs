// Prepares an *_e2e database (create, migrate, reset + seed) and starts the built API on it.
// Called from each app's Playwright webServer script; Playwright starts it before any test runs.
import { execFileSync, execSync, spawn } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { apiDir } from './env.mjs';
import { startFakeGateway } from './fake-gateway.mjs';

/** @param {NodeJS.ProcessEnv} env from createE2eEnv */
export async function startE2eApi(env) {
  const target = new URL(env.DATABASE_URL ?? '');
  const dbName = target.pathname.slice(1);
  if (!dbName.endsWith('_e2e')) throw new Error('Refusing to start: the database name must end with _e2e');
  const admin = new URL(target);
  admin.pathname = '/postgres';

  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
  await client.end();

  execSync('pnpm exec prisma migrate deploy', { cwd: apiDir, env, stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(apiDir, 'dist/scripts/e2e-seed.js')], { env, stdio: 'inherit' });

  // The payment gateway stand-in (unless the run uses the real test gateways).
  const gateway = env.E2E_GATEWAY_PORT ? startFakeGateway(Number(env.E2E_GATEWAY_PORT), env) : null;
  const child = spawn(process.execPath, [path.join(apiDir, 'dist/main.js')], { env, stdio: 'inherit' });
  const stop = () => {
    child.kill();
    gateway?.close();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', (code) => process.exit(code ?? 0));
}
