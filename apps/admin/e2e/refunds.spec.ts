import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_EDITOR2_EMAIL } from './e2e-env.mjs';

/**
 * Phase 11 part 3 in the CMS: a paid order has its receipt number; staff request a full refund, approve it (the
 * student's access goes) and record the money as sent.
 */
let page: Page;
let orderId = '';
const run = Date.now().toString(36);
const studentName = `Hari Bista ${run}`;
test.describe.configure({ mode: 'serial' });
const nav = (name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_EDITOR2_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(nav('Refunds')).toBeVisible();
  const token = (
    (await (
      await page.request.post('/api/v1/admin/auth/refresh', { headers: { 'X-TK-Client': 'admin' } })
    ).json()) as { accessToken: string }
  ).accessToken;
  const staff = async (method: 'POST' | 'PUT', path: string, data: unknown) => {
    const res = await page.request.fetch(`/api/v1${path}`, {
      method,
      data,
      headers: { Authorization: `Bearer ${token}`, 'X-TK-Client': 'admin' },
    });
    expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true);
    return (res.status() === 204 ? null : await res.json()) as { id: string };
  };
  const subject = await staff('POST', '/admin/subjects', { name: { en: `GK ${run}` } });
  await staff('PUT', `/admin/subjects/${subject.id}/status`, { status: 'published' });
  const course = await staff('POST', '/admin/courses', {
    slug: `gk-${run}`,
    title: { en: `General Knowledge ${run}` },
  });
  // Test price, not a business value.
  await staff('PUT', `/admin/courses/${course.id}/pricing`, {
    pricePaisa: 80_000,
    salePricePaisa: null,
    saleStartsAt: null,
    saleEndsAt: null,
    validityType: 'lifetime',
    validityDays: null,
    validityEndsOn: null,
  });
  await staff('PUT', `/admin/courses/${course.id}/subjects`, { subjects: [{ subjectId: subject.id }] });
  await staff('PUT', `/admin/courses/${course.id}/publishing`, { status: 'published' });

  // The student buys with Khalti (local stand-in).
  const registered = await page.request.post('/api/v1/auth/register', {
    data: {
      fullName: studentName,
      email: `hari.${run}@example.com`,
      password: 'wants a refund',
      acceptTerms: true,
      device: { deviceId: `e2e-refund-${run}`, deviceName: 'E2E', platform: 'android' },
    },
  });
  const student = ((await registered.json()) as { accessToken: string }).accessToken;
  const asStudent = { Authorization: `Bearer ${student}`, 'X-TK-Platform': 'android' };
  const order = (await (
    await page.request.post('/api/v1/orders', { data: { courseId: course.id }, headers: asStudent })
  ).json()) as { id: string };
  orderId = order.id;
  const started = (await (
    await page.request.post(`/api/v1/orders/${order.id}/pay`, {
      data: { provider: 'khalti', returnTo: 'app' },
      headers: asStudent,
    })
  ).json()) as { redirectUrl: string };
  const confirm = new URL(started.redirectUrl);
  confirm.pathname = '/khalti/pay/confirm';
  confirm.searchParams.set('action', 'pay');
  expect((await page.request.get(confirm.toString(), { maxRedirects: 0 })).status()).toBe(302);
  // Viewing the order checks the payment with the gateway.
  await expect
    .poll(
      async () =>
        (
          (await (await page.request.get(`/api/v1/orders/${order.id}`, { headers: asStudent })).json()) as {
            status: string;
          }
        ).status,
    )
    .toBe('paid');
});
test.afterAll(async () => {
  await page.close();
});

test('a paid order has its receipt; a full refund is requested, approved and recorded as sent', async () => {
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText(/^TK-\d{4}\/\d{2}-\d{6}$/)).toBeVisible();

  await page.getByRole('button', { name: 'Request refund' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Amount (Rs)')).toHaveValue('800');
  await dialog.getByLabel('Reason').fill('Bought the wrong course');
  await dialog.getByRole('button', { name: 'Request refund' }).click();
  await expect(page.getByText('Refund requested')).toBeVisible();

  await nav('Refunds').click();
  const row = page.getByRole('row', { name: new RegExp(studentName) });
  await expect(row.getByText('Bought the wrong course')).toBeVisible();
  await row.getByRole('link', { name: /#\d{6}/ }).click();

  const refund = page.getByRole('group', { name: 'Refund Rs 800' });
  await refund.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Refund approved')).toBeVisible();
  await expect(refund.getByText('Access removed')).toBeVisible();
  await expect(page.getByText('Refunded', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('refund', { exact: true })).toBeVisible();

  await refund.getByRole('button', { name: 'Mark as refunded' }).click();
  await page.getByRole('dialog').getByLabel('Refund reference').fill(`KHALTI-RF-${run}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Mark as refunded' }).click();
  await expect(page.getByText('Refund recorded')).toBeVisible();
  await expect(refund.getByText(`KHALTI-RF-${run}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request refund' })).toHaveCount(0);
});
