import { defineConfig, devices } from '@playwright/test';

/**
 * Browser end-to-end tests: real API (built) + real admin dev server + a dedicated `*_e2e` PostgreSQL database.
 * Run `pnpm build` first. Locally the database URL is derived from TEST_DATABASE_URL in the root .env.
 */
export const E2E_API_PORT = 4010;
export const E2E_ADMIN_PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${E2E_ADMIN_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
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
      command: `vite --port ${E2E_ADMIN_PORT} --strictPort`,
      url: `http://localhost:${E2E_ADMIN_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_PROXY: `http://localhost:${E2E_API_PORT}` },
    },
  ],
});
