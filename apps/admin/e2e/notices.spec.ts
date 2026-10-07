import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_EDITOR3_EMAIL, E2E_STUDENT_EMAIL } from './e2e-env.mjs';

/**
 * Phase 12 in the CMS: write a notice (bilingual title, rich text), pin it, ask for push / email, publish it; tell a
 * course's students about an update.
 */
let page: Page;
const run = Date.now().toString(36);
const title = `Section Officer form ${run}`;
test.describe.configure({ mode: 'serial' });
const nav = (name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_EDITOR3_EMAIL);
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

test("staff tell a course's students about an update", async () => {
  const token = (
    (await (
      await page.request.post('/api/v1/admin/auth/refresh', { headers: { 'X-TK-Client': 'admin' } })
    ).json()) as { accessToken: string }
  ).accessToken;
  const staff = async (method: 'GET' | 'POST', path: string, data?: unknown) => {
    const res = await page.request.fetch(`/api/v1${path}`, {
      method,
      data,
      headers: { Authorization: `Bearer ${token}`, 'X-TK-Client': 'admin' },
    });
    expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true);
    return res.json() as Promise<{ id: string; data: Array<{ id: string }> }>;
  };
  // A course and the seeded student with access to it (a staff grant).
  const course = await staff('POST', '/admin/courses', {
    slug: `updates-${run}`,
    title: { en: `Nayab Subba ${run}` },
  });
  const [student] = (await staff('GET', `/admin/users?q=${encodeURIComponent(E2E_STUDENT_EMAIL)}`)).data;
  await staff('POST', `/admin/users/${student!.id}/entitlements`, { courseId: course.id, endsAt: null });

  await page.goto(`/courses/${course.id}`);
  await page.getByRole('tab', { name: 'Notify students' }).click();
  await expect(page.getByText('1 student with access now')).toBeVisible();
  await page.getByRole('button', { name: 'Send to students' }).click();
  await expect(page.getByText('Write a title in English or Nepali')).toBeVisible();
  await page.getByLabel('Title (English)').fill('New mock tests added');
  await page.getByLabel('Message (English)').fill('Three full mock tests are now in the course.');
  await page.getByRole('button', { name: 'Send to students' }).click();
  await expect(page.getByRole('dialog', { name: 'Send this update?' })).toContainText('1 student');
  await page.getByRole('button', { name: 'Send update' }).click();
  await expect(page.getByText('Update sent to 1 student')).toBeVisible();
  const sent = page.getByRole('listitem').filter({ hasText: 'New mock tests added' });
  await expect(sent).toContainText('Three full mock tests are now in the course.');
  await expect(sent).toContainText('1 student');
  await expect(page.getByLabel('Title (English)')).toHaveValue('');
});
