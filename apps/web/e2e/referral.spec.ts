import { expect, test } from '@playwright/test';
import { E2E_API_ORIGIN } from './constants.mjs';
import { apiCall, codeFromEmail, editorToken } from './helpers';

/**
 * Phase 11 part 4b on the website: a referral link opens sign-up with the code filled in (D-059); the friend's first
 * purchase gets the referral discount and, once paid, the student who invited them gets a reward coupon (D-058).
 * The suite starts with the programme on (E2E_SETTINGS): friend 10%, reward Rs 100 for 30 days.
 */
const run = Date.now().toString(36);
const slug = `ref-${run}`;
const title = `Kharidar Referral ${run}`;

test('a friend signs up from a referral link and gets the discount; the referrer gets a reward', async ({
  browser,
  request,
}) => {
  const token = await editorToken(request);
  const call = <T = { id: string }>(method: 'POST' | 'PUT', p: string, data?: unknown) =>
    apiCall<T>(request, token, method, p, data);
  const subject = await call('POST', '/admin/subjects', { name: { en: `Accounts ${run}` } });
  await call('PUT', `/admin/subjects/${subject.id}/status`, { status: 'published' });
  const course = await call('POST', '/admin/courses', { slug, title: { en: title } });
  // Test price, not a business value.
  await call('PUT', `/admin/courses/${course.id}/pricing`, {
    pricePaisa: 200_000,
    salePricePaisa: null,
    saleStartsAt: null,
    saleEndsAt: null,
    validityType: 'lifetime',
    validityDays: null,
    validityEndsOn: null,
  });
  await call('PUT', `/admin/courses/${course.id}/subjects`, { subjects: [{ subjectId: subject.id }] });
  await call('PUT', `/admin/courses/${course.id}/publishing`, { status: 'published' });

  // The student who invites (an existing account, through the API).
  const inviter = await request.post(`${E2E_API_ORIGIN}/api/v1/auth/register`, {
    data: {
      fullName: 'Inviting Student',
      email: `inviter.${run}@example.com`,
      password: 'invites friends',
      acceptTerms: true,
      device: { deviceId: `e2e-inviter-${run}`, deviceName: 'E2E', platform: 'android' },
    },
  });
  const inviterToken = ((await inviter.json()) as { accessToken: string }).accessToken;
  const mine = async () =>
    (await (
      await request.get(`${E2E_API_ORIGIN}/api/v1/me/referral`, {
        headers: { Authorization: `Bearer ${inviterToken}` },
      })
    ).json()) as { code: string; rewards: Array<{ state: string; amountPaisa: number }> };
  const { code } = await mine();

  const page = await browser.newPage();
  await page.goto(`/r/${code}`);
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(page.getByLabel('Referral code (optional)')).toHaveValue(code);
  const email = `friend.${run}@example.com`;
  await page.getByLabel('Full name').fill('Referred Friend');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a friend buys');
  await page.getByLabel('I accept the terms of use and the privacy policy.').check();
  const since = new Date();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('6-digit code').fill(await codeFromEmail(page.request, email, since));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('heading', { name: 'Referred Friend' })).toBeVisible();

  await page.goto(`/checkout/${slug}`);
  await expect(page.getByText('Referral discount')).toBeVisible();
  await expect(page.getByText('− Rs 200')).toBeVisible();
  await expect(page.getByTestId('total')).toHaveText('Rs 1,800');
  await page.getByRole('radio', { name: 'Khalti' }).check();
  await page.getByRole('button', { name: 'Pay Rs 1,800' }).click();
  await page.getByRole('link', { name: 'Pay with Khalti' }).click();
  await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible({ timeout: 20_000 });

  await expect
    .poll(async () => (await mine()).rewards)
    .toEqual([expect.objectContaining({ state: 'available', amountPaisa: 10_000 })]);
  await page.close();
});
