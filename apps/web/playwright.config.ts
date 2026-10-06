import { defineConfig, devices } from '@playwright/test';
import { E2E_API_PORT, E2E_WEB_ORIGIN } from './e2e/constants.mjs';

/**
 * Website browser tests: the production build (`next start`) against the real API on its own `*_e2e` database, with
 * the local eSewa / Khalti stand-in. Codes sent by email are read from Mailpit. Run `pnpm build` first.
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
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
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
      command: 'node e2e/start-web.mjs',
      url: E2E_WEB_ORIGIN,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
    },
  ],
});
