import { expect, test } from '@playwright/test';
import { E2E_SENTRY_HOST } from './e2e-env.mjs';

/**
 * Admin error monitoring (T-042): an unexpected error reaches Sentry (here a fake host) with the page path only —
 * no query string, typed form values, console output, cookies, breadcrumbs or user.
 */
test('an unexpected error is reported without personal data', async ({ page }) => {
  const envelopes: string[] = [];
  await page.route(`${E2E_SENTRY_HOST}/**`, async (route) => {
    envelopes.push(route.request().postData() ?? '');
    await route.fulfill({ status: 200, body: '{}' });
  });

  await page.goto('/login?email=staff.private@example.com&token=private-token');
  await page.getByLabel('Email', { exact: true }).fill('typed.private@example.com');
  await page.getByLabel('Password', { exact: true }).fill('private-password');
  await page.evaluate(() => {
    console.warn('console text private-console');
    setTimeout(() => {
      throw new Error('Admin monitoring test error');
    });
  });

  await expect.poll(() => envelopes.join(' '), { timeout: 15_000 }).toContain('Admin monitoring test error');
  const sent = envelopes.join(' ');
  expect(sent).toContain('"service":"admin"');
  expect(sent).toContain('"url":"/login"');
  for (const secret of [
    'staff.private@example.com',
    'private-token',
    'typed.private@example.com',
    'private-password',
    'private-console',
  ]) {
    expect(sent, secret).not.toContain(secret);
  }
});
