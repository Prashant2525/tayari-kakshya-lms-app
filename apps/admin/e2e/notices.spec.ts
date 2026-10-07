import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_EDITOR2_EMAIL } from './e2e-env.mjs';

/** Phase 12a in the CMS: write a notice (bilingual title, rich text), pin it, ask for push / email, publish it. */
let page: Page;
const run = Date.now().toString(36);
const title = `Section Officer form ${run}`;
test.describe.configure({ mode: 'serial' });
const nav = (name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_EDITOR2_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(nav('Notices')).toBeVisible();
});
test.afterAll(async () => {
  await page.close();
});

test('staff write, pin and publish a notice that is also pushed', async () => {
  await nav('Notices').click();
  await expect(page.getByRole('heading', { name: 'Notices', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'New notice' }).click();
  await page.getByLabel('Title (English)').fill(title);
  await page.getByLabel('शीर्षक (नेपाली)').fill(`शाखा अधिकृत फारम ${run}`);
  // An empty notice is refused.
  await page.getByRole('button', { name: 'Create notice' }).click();
  await expect(page.getByText('Write the notice')).toBeVisible();
  await page.getByRole('textbox', { name: 'Notice (English)' }).click();
  await page.keyboard.type('Forms are open until the end of the month.');
  await page.getByRole('switch', { name: 'Pin to the top' }).click();
  await page.getByRole('switch', { name: 'Send as push notification and email' }).click();
  await page.getByRole('button', { name: 'Create notice' }).click();
  await expect(page.getByText('Notice created')).toBeVisible();

  await page.getByLabel('Notice status').selectOption('published');
  await page.getByRole('button', { name: 'Update status' }).click();
  await expect(page.getByText('Status: Published')).toBeVisible();

  await page.getByRole('main').getByRole('link', { name: 'Notices' }).click();
  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(row.getByLabel('Pinned')).toBeVisible();
  await expect(row.getByText('Official notice')).toBeVisible();
  // Sent by the worker once live.
  await expect(row.getByText('When live')).toBeVisible();
  await expect(row.getByText('Published')).toBeVisible();
});
