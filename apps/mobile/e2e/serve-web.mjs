// Builds the app for the web and serves it like a real deployment: static files + `/api` proxied to the E2E API.
// The web build is only for development and browser tests; students use the native apps (T-035).
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  E2E_API_PORT,
  E2E_POSTHOG_HOST,
  E2E_POSTHOG_KEY,
  E2E_SENTRY_DSN,
  E2E_WEB_PORT,
} from './constants.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(appDir, 'dist-e2e');

if (!process.env.E2E_SKIP_WEB_BUILD) {
  execSync('pnpm exec expo export --platform web --output-dir dist-e2e --clear', {
    cwd: appDir,
    // Same-origin API: requests go to /api/v1 on this server and are proxied below. Public keys from the
    // developer's apps/mobile/.env are replaced (values already in the environment win over .env files): no real
    // Google client, analytics or Sentry project in test builds.
    env: {
      ...process.env,
      EXPO_PUBLIC_API_URL: '',
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: '',
      EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: '',
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: '',
      EXPO_PUBLIC_POSTHOG_KEY: E2E_POSTHOG_KEY,
      EXPO_PUBLIC_POSTHOG_HOST: E2E_POSTHOG_HOST,
      EXPO_PUBLIC_SENTRY_DSN: E2E_SENTRY_DSN,
      CI: '1',
    },
    stdio: 'inherit',
  });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const upstream = http.request(
        { host: '127.0.0.1', port: E2E_API_PORT, path: req.url, method: req.method, headers: req.headers },
        (r) => {
          res.writeHead(r.statusCode ?? 502, r.headers);
          r.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
      return;
    }
    const file = path.join(outDir, path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, ''));
    const safe = file.startsWith(outDir) && existsSync(file) && statSync(file).isFile();
    // Single-page app: unknown paths get index.html and the router takes over.
    const target = safe ? file : path.join(outDir, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] ?? 'application/octet-stream' });
    createReadStream(target).pipe(res);
  })
  .listen(E2E_WEB_PORT, () =>
    process.stdout.write(`Student app (web build) on http://localhost:${E2E_WEB_PORT}\n`),
  );
