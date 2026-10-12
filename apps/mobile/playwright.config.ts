import { defineConfig, devices } from '@playwright/test';
import { E2E_API_PORT, E2E_WEB_ORIGIN } from './e2e/constants.mjs';

/**
 * Student app browser tests: the web build of the app (phone viewport) against the real API on its own `*_e2e`
 * database. Codes sent by email are read from Mailpit. Run `pnpm build` (API + packages) first.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: E2E_WEB_ORIGIN,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'Asia/Kathmandu',
    // The first-launch language step (D-074) is taken by app.spec.ts; other specs start with it done.
    storageState: {
      cookies: [],
      origins: [
        { origin: E2E_WEB_ORIGIN, localStorage: [{ name: 'tk.prefs', value: '{"languageChosen":true}' }] },
      ],
    },
  },
  projects: [{ name: 'phone', use: { ...devices['Pixel 7'] } }],
  webServer: [
    {
      command: 'node e2e/start-api.mjs',
      url: `http://localhost:${E2E_API_PORT}/api/v1/health/ready`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'node e2e/serve-web.mjs',
      url: E2E_WEB_ORIGIN,
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: 'pipe',
    },
  ],
});
