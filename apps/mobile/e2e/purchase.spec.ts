import { expect, test, type Page } from '@playwright/test';
import { E2E_WEB_ORIGIN } from './constants.mjs';
import { apiCall, editorToken } from './helpers';

/**
 * Phase 11 against the real API and a local stand-in for eSewa/Khalti (or the real test gateways with
 * E2E_REAL_GATEWAYS=1): Buy → checkout (server price) → cancel at the gateway → not paid, no access → try again with
 * eSewa → paid → access → Profile → Purchases.
 */
const run = Date.now().toString(36);
const password = 'buy the course';
const email = `buyer.${run}@example.com`;
const slug = `paid-${run}`;
const courseTitle = `Kharidar Complete ${run}`;
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});

let page: Page;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, request }) => {
  const token = await editorToken(request);
  const call = <T = { id: string }>(method: 'POST' | 'PUT', p: string, data?: unknown) =>
    apiCall<T>(request, token, method, p, data);
  const subject = await call('POST', '/admin/subjects', { name: { en: `Accounts ${run}` } });
  const chapter = await call('POST', `/admin/subjects/${subject.id}/chapters`, {
    numberLabel: '1',
    title: { en: 'Basics' },
  });
  const topic = await call('POST', `/admin/chapters/${chapter.id}/topics`, {
    numberLabel: '1.1',
    title: { en: 'Ledgers' },
  });
  for (const [level, id] of [
    ['subjects', subject.id],
    ['chapters', chapter.id],
    ['topics', topic.id],
  ] as const) {
    await call('PUT', `/admin/${level}/${id}/status`, { status: 'published' });
  }
  const item = await call('POST', `/admin/topics/${topic.id}/items`, {
    type: 'note',
    title: { en: 'Premium ledger notes' },
    accessLevel: 'premium',
    noteContent: doc('Debit what comes in.'),
  });
  await call('PUT', `/admin/learning-items/${item.id}/publishing`, { status: 'published' });
  const course = await call('POST', '/admin/courses', { slug, title: { en: courseTitle } });
  // Test prices, not business values.
  await call('PUT', `/admin/courses/${course.id}/pricing`, {
    pricePaisa: 150_000,
    salePricePaisa: null,
    saleStartsAt: null,
    saleEndsAt: null,
    validityType: 'days',
    validityDays: 30,
    validityEndsOn: null,
  });
  await call('PUT', `/admin/courses/${course.id}/subjects`, { subjects: [{ subjectId: subject.id }] });
  await call('PUT', `/admin/courses/${course.id}/publishing`, { status: 'published' });

  const registered = await request.post(`${E2E_WEB_ORIGIN}/api/v1/auth/register`, {
    data: {
      fullName: 'Ramesh Adhikari',
      email,
      password,
      acceptTerms: true,
      device: { deviceId: `e2e-buy-${run}`, deviceName: 'E2E', platform: 'web' },
    },
  });
  expect(registered.ok(), await registered.text()).toBe(true);
  page = await browser.newPage();
});
test.afterAll(async () => {
  await page.close();
});

const visible = <T extends ReturnType<Page['getByRole']>>(l: T) => l.filter({ visible: true });
const button = (name: string | RegExp) =>
  visible(page.getByRole('button', { name, exact: typeof name === 'string' }));
const text = (value: string | RegExp) => visible(page.getByText(value));

test('a cancelled payment gives no access; paying with eSewa does', async () => {
  await page.goto('/');
  await visible(page.getByLabel('Email', { exact: true })).fill(email);
  await visible(page.getByLabel('Password', { exact: true })).fill(password);
  await button('Log in').click();
  await button('Skip').click();

  await page.goto(`/course/${slug}`);
  await button('Buy').click();
  await expect(visible(page.getByRole('heading', { name: 'Checkout' }))).toBeVisible();
  await expect(text('Access for 30 days')).toBeVisible();
  await expect(visible(page.getByRole('radio', { name: 'eSewa' }))).toBeVisible();
  await visible(page.getByRole('radio', { name: 'Khalti' })).click();
  await button('Pay Rs 1,500').click();

  // The gateway's page (stand-in): the student cancels.
  await page.getByRole('link', { name: 'Cancel payment' }).click();
  await expect(text('Payment not completed')).toBeVisible();
  await expect(text(/Order #\d{6} · Rs 1,500/)).toBeVisible();

  await button('Try again').click();
  await visible(page.getByRole('radio', { name: 'eSewa' })).click();
  await button('Pay Rs 1,500').click();
  // Our page posts the signed form to eSewa (stand-in), which shows its own page.
  await page.getByRole('link', { name: 'Pay with eSewa' }).click();
  await expect(text('Payment successful')).toBeVisible({ timeout: 20_000 });
  await expect(text(`You now have access to ${courseTitle}.`)).toBeVisible();

  await button('Start learning').click();
  await expect(text('You have access to this course.')).toBeVisible();
});

test('Purchases lists the paid order', async () => {
  await page.goto('/profile');
  await visible(page.getByRole('link', { name: 'Purchases' })).click();
  await expect(text(courseTitle)).toBeVisible();
  await expect(text('Paid')).toBeVisible();
});
