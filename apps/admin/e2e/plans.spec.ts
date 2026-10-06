import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_EDITOR2_EMAIL } from './e2e-env.mjs';

/** Phase 11 part 2 in the CMS: staff create a plan, write its card, price it, choose its courses and publish it. */
let page: Page;
const run = Date.now().toString(36);
const courseTitle = `Nayab Subba ${run}`;
const planName = `Premium ${run}`;
test.describe.configure({ mode: 'serial' });
const nav = (name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_EDITOR2_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(nav('Plans')).toBeVisible();
  const token = (
    (await (
      await page.request.post('/api/v1/admin/auth/refresh', { headers: { 'X-TK-Client': 'admin' } })
    ).json()) as { accessToken: string }
  ).accessToken;
  const res = await page.request.post('/api/v1/admin/courses', {
    data: { slug: `nayab-${run}`, title: { en: courseTitle } },
    headers: { Authorization: `Bearer ${token}`, 'X-TK-Client': 'admin' },
  });
  expect(res.ok(), await res.text()).toBe(true);
});
test.afterAll(async () => {
  await page.close();
});

test('staff build and publish a plan', async () => {
  await nav('Plans').click();
  await expect(page.getByRole('heading', { name: 'Plans', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'New plan' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name (English)').fill(planName);
  await dialog.getByLabel('Address (slug)').fill(`premium-${run}`);
  await dialog.getByRole('button', { name: 'Create plan' }).click();
  await expect(page.getByRole('heading', { name: planName, level: 1 })).toBeVisible();

  // The card: features and whether it is highlighted.
  await page.getByRole('button', { name: 'Add feature' }).click();
  await page.getByLabel('Feature 1 (English)').fill('All premium notes');
  await page.getByRole('switch', { name: 'Highlight' }).click();
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.getByText('Plan saved')).toBeVisible();

  // Test price, not a business value.
  await page.getByLabel('Price (Rs)', { exact: true }).fill('2500');
  await page.getByLabel('Days').fill('90');
  await page.getByRole('button', { name: 'Save' }).nth(1).click();
  await expect(page.getByText('Pricing saved')).toBeVisible();

  await page.getByRole('checkbox', { name: courseTitle }).check();
  await page.getByRole('button', { name: 'Save' }).nth(2).click();
  await expect(page.getByText('Courses saved')).toBeVisible();

  await page.getByLabel('Plan status').selectOption('published');
  await page.getByRole('button', { name: 'Update status' }).click();
  await expect(page.getByText('Status: Published')).toBeVisible();

  await page.getByRole('main').getByRole('link', { name: 'Plans' }).click();
  const row = page.getByRole('row', { name: new RegExp(planName) });
  await expect(row.getByText('1 course')).toBeVisible();
  await expect(row.getByText('Rs 2,500')).toBeVisible();
  await expect(row.getByText('Published')).toBeVisible();
});
