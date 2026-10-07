import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_STUDENT_EMAIL } from '@tk/e2e-support/accounts';
import { apiCall, editorToken } from './helpers';

/**
 * Phase 12a: notices from the CMS appear in the Notice tab (pinned first, with a "new" badge until the tab is
 * opened) and open in full; the notifications list and settings are there for the student.
 */
const run = Date.now().toString(36);
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
let page: Page;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, request }) => {
  // The seeded student (sign-up has an hourly limit per IP); published after they joined, so these count as new.
  const token = await editorToken(request);
  for (const [title, isPinned] of [
    [`Kharidar form open ${run}`, false],
    [`Exam centre list ${run}`, true],
  ] as const) {
    const notice = await apiCall(request, token, 'POST', '/admin/notices', {
      kind: 'official',
      title: { en: title },
      body: doc(`${title}: details for candidates.`),
      isPinned,
      expiresAt: null,
      notify: false,
    });
    await apiCall(request, token, 'PUT', `/admin/notices/${notice.id}/status`, { status: 'published' });
  }
  page = await browser.newPage();
});
test.afterAll(async () => {
  await page.close();
});

const visible = <T extends ReturnType<Page['getByRole']>>(l: T) => l.filter({ visible: true });
const text = (value: string | RegExp) => visible(page.getByText(value));

test('the Notice tab shows new notices, pinned first, and opens one', async () => {
  await page.goto('/');
  await visible(page.getByLabel('Email', { exact: true })).fill(E2E_STUDENT_EMAIL);
  await visible(page.getByLabel('Password', { exact: true })).fill(E2E_ADMIN_PASSWORD);
  await visible(page.getByRole('button', { name: 'Log in', exact: true })).click();
  await visible(page.getByRole('button', { name: 'Skip', exact: true })).click();

  const tab = visible(page.getByRole('tab', { name: /Notices, 2 new/ }));
  await expect(tab).toBeVisible();
  await tab.click();
  const cards = visible(page.getByRole('link', { name: new RegExp(run) }));
  await expect(cards.first()).toHaveAccessibleName(`Exam centre list ${run}`);
  await expect(text(`Kharidar form open ${run}: details for candidates.`)).toBeVisible();
  await expect(visible(page.getByRole('tab', { name: 'Notices', exact: true }))).toBeVisible();

  await visible(page.getByRole('link', { name: `Kharidar form open ${run}` })).click();
  await expect(visible(page.getByRole('heading', { name: `Kharidar form open ${run}` }))).toBeVisible();
  await expect(text('Official notice')).toBeVisible();
});

test('notifications: an empty list to start, and push / email choices that are kept', async () => {
  await page.goto('/');
  await visible(page.getByRole('link', { name: 'Notifications' })).click();
  await expect(text('No notifications yet')).toBeVisible();

  await page.goto('/profile/notifications');
  const examEmail = visible(page.getByRole('switch', { name: 'Exam reminders · Email' }));
  await expect(examEmail).toBeChecked();
  await examEmail.click();
  await expect(examEmail).not.toBeChecked();
  await page.reload();
  await expect(visible(page.getByRole('switch', { name: 'Exam reminders · Email' }))).not.toBeChecked();
  await expect(
    text('Push notifications are not available on this device yet; you can still choose emails.'),
  ).toBeVisible();
});
