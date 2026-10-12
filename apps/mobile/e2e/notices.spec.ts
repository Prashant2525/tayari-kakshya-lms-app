import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_STUDENT_EMAIL } from '@tk/e2e-support/accounts';
import { E2E_WEB_ORIGIN } from './constants.mjs';
import { pngFixture } from '@tk/e2e-support/png';
import { apiCall, editorToken, uploadImage } from './helpers';

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
  // Home shows the latest notices too (D-074).
  await expect(visible(page.getByRole('heading', { name: 'Latest notices' }))).toBeVisible();
  await expect(visible(page.getByRole('link', { name: `Exam centre list ${run}` }))).toBeVisible();

  const tab = visible(page.getByRole('tab', { name: /Notices, 2 new/ }));
  await expect(tab).toBeVisible();
  await tab.click();
  const cards = visible(page.getByRole('link', { name: new RegExp(run) }));
  await expect(cards.first()).toHaveAccessibleName(`Exam centre list ${run}`);
  // Home shows the same notice: either copy will do.
  await expect(text(`Kharidar form open ${run}: details for candidates.`).first()).toBeVisible();
  await expect(visible(page.getByRole('tab', { name: 'Notices', exact: true }))).toBeVisible();

  await visible(page.getByRole('link', { name: `Kharidar form open ${run}` })).click();
  await expect(visible(page.getByRole('heading', { name: `Kharidar form open ${run}` }))).toBeVisible();
  await expect(text('Official notice')).toBeVisible();
});

test('notifications: a course update arrives; push / email choices are kept', async ({ request }) => {
  await page.goto('/');
  await visible(page.getByRole('link', { name: 'Notifications' })).click();
  await expect(text('No notifications yet')).toBeVisible();

  // Staff send a course update to the course's students (D-060).
  const token = await editorToken(request);
  const course = await apiCall(request, token, 'POST', '/admin/courses', {
    slug: `notified-${run}`,
    title: { en: `Section Officer ${run}` },
  });
  const users = await apiCall<{ data: Array<{ id: string }> }>(
    request,
    token,
    'GET',
    `/admin/users?q=${encodeURIComponent(E2E_STUDENT_EMAIL)}`,
  );
  await apiCall(request, token, 'POST', `/admin/users/${users.data[0]!.id}/entitlements`, {
    courseId: course.id,
    endsAt: null,
  });
  await apiCall(request, token, 'POST', `/admin/courses/${course.id}/updates`, {
    title: { en: `New mock tests ${run}` },
    message: { en: 'Three full mock tests are now in the course.' },
  });
  await page.reload();
  await expect(visible(page.getByRole('link', { name: `Unread: New mock tests ${run}` }))).toBeVisible();
  await expect(text('Three full mock tests are now in the course.')).toBeVisible();

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
  // The receipt is the purchase email (D-057), so purchases only offer push.
  await expect(
    visible(page.getByRole('switch', { name: 'Payments and purchases · Push notification' })),
  ).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Payments and purchases · Email' })).toHaveCount(0);
  await expect(text('Receipts always come by email.')).toBeVisible();
});

test('articles: Home → Current affairs → a weekly digest, with its source', async ({ request }) => {
  const token = await editorToken(request);
  const doc = (text: string) => ({
    en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
  });
  const created = await apiCall(request, token, 'POST', '/admin/articles', {
    kind: 'current_affairs',
    slug: `weekly-${run}`,
    title: { en: `This week ${run}: budget and monsoon` },
    summary: { en: 'Budget, monsoon floods and SAARC.' },
    body: doc('The budget raised spending on education.'),
    coverMediaId: null,
    categoryId: null,
    period: 'weekly',
    periodDate: '2026-10-04',
    sourceName: 'Kathmandu Post',
    sourceUrl: 'https://kathmandupost.com',
    quizAssessmentId: null,
    isFeatured: false,
    notify: false,
  });
  await apiCall(request, token, 'PUT', `/admin/articles/${created.id}/status`, { status: 'published' });

  await page.goto('/');
  await visible(page.getByRole('link', { name: 'Current affairs' })).click();
  await expect(visible(page.getByRole('heading', { name: 'Current affairs' }))).toBeVisible();
  await visible(page.getByRole('radio', { name: 'Weekly' })).click();
  const card = visible(page.getByRole('link', { name: `This week ${run}: budget and monsoon` }));
  await expect(card).toContainText('Budget, monsoon floods and SAARC.');
  await expect(card).toContainText('Weekly');
  await card.click();
  await expect(
    visible(page.getByRole('heading', { name: `This week ${run}: budget and monsoon` })),
  ).toBeVisible();
  await expect(text('The budget raised spending on education.')).toBeVisible();
  await expect(text('Source: Kathmandu Post')).toBeVisible();

  // Search finds it too.
  await page.goto('/search');
  await visible(page.getByLabel('Search', { exact: true })).fill(`week ${run}`);
  await expect(visible(page.getByRole('heading', { name: 'Articles' }))).toBeVisible();
  await visible(page.getByRole('link', { name: `This week ${run}: budget and monsoon` })).click();
  await expect(
    visible(page.getByRole('heading', { name: `This week ${run}: budget and monsoon` })),
  ).toBeVisible();
});

test('Profile → Help & support (contacts, FAQs) and a published page', async ({ request }) => {
  const token = await editorToken(request);
  await apiCall(request, token, 'POST', '/admin/contact-options', {
    type: 'email',
    label: { en: `Support email ${run}` },
    value: 'help@example.com',
    note: { en: 'We reply within a day.' },
    sortOrder: 0,
    active: true,
  });
  await apiCall(request, token, 'POST', '/admin/faqs', {
    question: { en: `How do I reset my password? ${run}` },
    answer: { en: 'Tap "Forgot password" on the sign-in screen.' },
    sortOrder: 0,
    active: true,
    hideOnIos: false,
  });
  await apiCall(request, token, 'PUT', '/admin/pages/about', {
    title: { en: 'About us' },
    body: {
      en: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: `We help Lok Sewa candidates ${run}.` }] },
        ],
      },
    },
  });
  await request.post(`${E2E_WEB_ORIGIN}/api/v1/admin/pages/about/publish`, {
    headers: { Authorization: `Bearer ${token}`, 'X-TK-Client': 'admin' },
  });

  await page.goto('/profile');
  await visible(page.getByRole('link', { name: 'Help & support' })).click();
  await expect(
    visible(page.getByRole('link', { name: `Support email ${run}: help@example.com` })),
  ).toBeVisible();
  await expect(text('We reply within a day.')).toBeVisible();
  await visible(page.getByRole('button', { name: `How do I reset my password? ${run}` })).click();
  await expect(text('Tap "Forgot password" on the sign-in screen.')).toBeVisible();

  await page.goto('/profile');
  await visible(page.getByRole('link', { name: 'About us' })).click();
  await expect(text(`We help Lok Sewa candidates ${run}.`)).toBeVisible();
});

test('a banner on Home opens the article it promotes', async ({ request }) => {
  const token = await editorToken(request);
  const imageMediaId = await uploadImage(request, token, pngFixture());
  await apiCall(request, token, 'POST', '/admin/banners', {
    title: { en: `Weekly current affairs ${run}` },
    imageMediaId,
    linkType: 'article',
    linkValue: `weekly-${run}`,
    placement: 'app',
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
    active: true,
    hideOnIos: false,
  });
  await page.goto('/');
  await visible(page.getByRole('link', { name: `Weekly current affairs ${run}` })).click();
  await expect(
    visible(page.getByRole('heading', { name: `This week ${run}: budget and monsoon` })),
  ).toBeVisible();
});
