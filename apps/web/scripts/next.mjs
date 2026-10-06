// Runs the Next.js CLI with the repository's root `.env` loaded (as the API's scripts do). The `--env-file` flag cannot
// be used here: `next dev` starts worker processes through NODE_OPTIONS, where Node refuses that flag. Values already
// in the environment win over the file, as with --env-file.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

await import('next/dist/bin/next');
