import { expect, test, type Page } from '@playwright/test';
import { apiCall, codeFromEmail, editorToken } from './helpers';

/**
 * Phase 11 part 4a: the public website. A visitor finds a course, is asked to sign up on Buy, verifies the email,
 * comes back to checkout with the share-link coupon applied, pays with Khalti (local stand-in), downloads the
 * receipt and sees the purchase in My account — the channel iOS users buy through (D-027).
 */
const run = Date.now().toString(36);
const slug = `web-${run}`;
const courseTitle = `Nayab Subba Web ${run}`;
const code = `WEB-${run}`.toUpperCase();
const email = `web.${run}@example.com`;
const password = 'buys on the web';
let page: Page;
const violations: string[] = [];
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, request }) => {
  const token = await editorToken(request);
  const call = <T = { id: string }>(method: 'POST' | 'PUT', p: string, data?: unknown) =>
    apiCall<T>(request, token, method, p, data);
  const subject = await call('POST', '/admin/subjects', { name: { en: `Constitution ${run}` } });
  await call('PUT', `/admin/subjects/${subject.id}/status`, { status: 'published' });
  const course = await call('POST', '/admin/courses', {
    slug,
    title: { en: courseTitle, ne: `नायब सुब्बा वेब ${run}` },
    shortDescription: { en: 'Everything for the written exam.' },
    isFeatured: true,
  });
  // Test values, not business values.
  await call('PUT', `/admin/courses/${course.id}/pricing`, {
    pricePaisa: 200_000,
    salePricePaisa: null,
    saleStartsAt: null,
    saleEndsAt: null,
    validityType: 'days',
    validityDays: 180,
    validityEndsOn: null,
  });
  await call('PUT', `/admin/courses/${course.id}/subjects`, { subjects: [{ subjectId: subject.id }] });
  await call('PUT', `/admin/courses/${course.id}/publishing`, { status: 'published' });
  await call('POST', '/admin/coupons', {
    code,
    note: null,
    discountType: 'percent',
    percentBps: 1000,
    amountPaisa: null,
    maxDiscountPaisa: null,
    minOrderPaisa: null,
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    perUserLimit: null,
    appliesTo: 'everything',
    courseIds: [],
    planIds: [],
    allowOnSale: false,
    active: true,
  });
  page = await browser.newPage();
  // R-3: every Content-Security-Policy violation during the whole visit is collected and must stay empty.
  await page.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`),
    ),
  );
  page.on('console', (m) => {
    if (m.type() === 'error' && m.text().startsWith('CSP violation')) violations.push(m.text());
  });
});
test.afterAll(async () => {
  await page.close();
});

test('a course page shows the CMS content and its price; the site switches to Nepali', async () => {
  await page.goto('/courses');
  await page.getByRole('link', { name: new RegExp(courseTitle) }).click();
  await expect(page.getByRole('heading', { name: courseTitle, level: 1 })).toBeVisible();
  await expect(page.getByText('Everything for the written exam.')).toBeVisible();
  await expect(page.getByText('Rs 2,000')).toBeVisible();
  await expect(page.getByText('Access for 180 days')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buy' })).toBeVisible();

  await page.getByRole('button', { name: 'Read this site in Nepali' }).click();
  await expect(page.getByRole('heading', { name: `नायब सुब्बा वेब ${run}`, level: 1 })).toBeVisible();
  await expect(page.getByText('१८० दिनको पहुँच')).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'मुख्य' }).getByRole('link', { name: 'कोर्सहरू' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'यो साइट अंग्रेजीमा पढ्नुहोस्' }).click();
  await expect(page.getByRole('heading', { name: courseTitle, level: 1 })).toBeVisible();
});

test('a share link: sign up, verify the email, then checkout with the coupon → Khalti → paid → receipt', async () => {
  await page.goto(`/checkout/${slug}?coupon=${code.toLowerCase()}`);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('Full name').fill('Sunita Rai');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('I accept the terms of use and the privacy policy.').check();
  const since = new Date();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  await page.getByLabel('6-digit code').fill(await codeFromEmail(page.request, email, since));
  await page.getByRole('button', { name: 'Verify' }).click();

  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  await expect(page.getByText(`Coupon ${code} applied`)).toBeVisible();
  await expect(page.getByText('− Rs 200')).toBeVisible();
  await expect(page.getByTestId('total')).toHaveText('Rs 1,800');
  await page.getByRole('radio', { name: 'Khalti' }).check();
  await page.getByRole('button', { name: 'Pay Rs 1,800' }).click();

  // The gateway's page (stand-in), then back to the website through the API's verified return.
  await page.getByRole('link', { name: 'Pay with Khalti' }).click();
  await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Order #\d{6} · Rs 1,800/)).toBeVisible();
  const [receipt] = await Promise.all([
    page.context().waitForEvent('request', (r) => r.url().includes('/receipts/')),
    page.getByRole('button', { name: 'Download receipt' }).click(),
  ]);
  expect((await page.request.get(receipt.url())).headers()['content-type']).toBe('application/pdf');

  await page.getByRole('link', { name: 'My purchases' }).click();
  await expect(page.getByText(courseTitle)).toBeVisible();
  await expect(page.getByText('Paid')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Receipt TK-/ })).toBeVisible();

  await page.goto(`/courses/${slug}`);
  await expect(
    page.getByText('You have access to this course. Learn in the Tayari Kakshya app.'),
  ).toBeVisible();
});

test('sign out, then sign in again with the same account', async () => {
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('wrong password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('The email or password is not correct.')).toBeVisible();
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Sunita Rai' })).toBeVisible();
});

test('anyone can check a certificate number', async () => {
  await page.goto('/certificates');
  await page.getByLabel('Certificate number').fill('ZZZZ-ZZZZ-ZZZZ');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('No certificate has this number.')).toBeVisible();
});

test('pages carry a per-request script nonce; nothing was blocked during the visit (R-3)', async () => {
  const first = await page.goto('/');
  const second = await page.goto('/courses');
  const csp = (r: typeof first) => r!.headers()['content-security-policy'] ?? '';
  expect(csp(first)).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp(first)).not.toContain('unsafe-eval');
  expect(csp(first).match(/nonce-([^']+)/)![1]).not.toBe(csp(second).match(/nonce-([^']+)/)![1]);
  expect(await page.locator('script[nonce]').count()).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});
