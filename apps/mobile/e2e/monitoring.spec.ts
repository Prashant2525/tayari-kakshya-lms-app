import { expect, test } from '@playwright/test';
import { E2E_SENTRY_HOST } from './constants.mjs';

/**
 * App crash reporting (T-042): an unexpected error reaches Sentry (here a fake host) without personal data — no
 * typed values, console output, query string, breadcrumbs or user.
 */
test('an unexpected error is reported without personal data', async ({ page }) => {
  const envelopes: string[] = [];
  await page.route(`${E2E_SENTRY_HOST}/**`, async (route) => {
    envelopes.push(route.request().postData() ?? '');
    await route.fulfill({ status: 200, body: '{}' });
  });

  await page.goto('/login?email=student.private@example.com');
  await page.getByLabel('Email', { exact: true }).filter({ visible: true }).fill('typed.private@example.com');
  await page.getByLabel('Password', { exact: true }).filter({ visible: true }).fill('private-password');
  await page.evaluate(() => {
    console.warn('console text private-console');
    setTimeout(() => {
      throw new Error('App monitoring test error');
    });
  });

  await expect.poll(() => envelopes.join(' '), { timeout: 15_000 }).toContain('App monitoring test error');
  const sent = envelopes.join(' ');
  expect(sent).toContain('"service":"app"');
  for (const secret of [
    'student.private@example.com',
    'typed.private@example.com',
    'private-password',
    'private-console',
  ]) {
    expect(sent, secret).not.toContain(secret);
  }
});
