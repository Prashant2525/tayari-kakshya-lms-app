// Development only: runs the compiled API (dist/main.js, or the file given) and restarts it when the compiler writes new
// output. Replaces `node --watch-path=dist`, which on Windows also restarts when files are merely *read* (file-access
// notifications) — e.g. while the website's dev server scans the repository — leaving the API down most of the time.
// Here a restart needs a file whose modification time or size really changed.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(apiDir, 'dist');
const entry = process.argv[2] ?? 'dist/main.js';
const envFile = path.resolve(apiDir, '../../.env');

/** Modification time and size of every file under dist, by path. */
function snapshot(dir = distDir, into = new Map()) {
  if (!existsSync(dir)) return into;
  for (const entryName of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entryName.name);
    if (entryName.isDirectory()) snapshot(full, into);
    else {
      const s = statSync(full, { throwIfNoEntry: false });
      if (s) into.set(full, `${s.mtimeMs}:${s.size}`);
    }
  }
  return into;
}

let known = snapshot();
let child = null;
let restarting = null;

function start() {
  const args = [...(existsSync(envFile) ? [`--env-file=${envFile}`] : []), entry];
  child = spawn(process.execPath, args, { cwd: apiDir, stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (!restarting && signal !== 'SIGTERM')
      console.log(`[dev-run] API stopped (${code ?? signal}); waiting for changes`);
  });
}

function restart() {
  if (restarting) return;
  restarting = setTimeout(async () => {
    const old = child;
    if (old && old.exitCode === null) {
      await new Promise((resolve) => {
        old.once('exit', resolve);
        old.kill('SIGTERM');
      });
    }
    restarting = null;
    console.log('[dev-run] compiled output changed; restarting the API');
    start();
  }, 300);
}

watch(distDir, { recursive: true }, () => {
  const now = snapshot();
  const changed = now.size !== known.size || [...now].some(([file, stamp]) => known.get(file) !== stamp);
  known = now;
  if (changed) restart();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child?.kill('SIGTERM');
    process.exit(0);
  });
}

start();
