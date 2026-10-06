import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_EDITOR2_EMAIL } from './e2e-env.mjs';

/**
 * Phase 11 in the CMS: a student pays at the gateway (local stand-in) and never comes back; staff find the order,
 * check it with Khalti, and the payment completes and gives access — with every gateway message kept.
 */
let page: Page;
let token = '';
let orderNumber = '';
const run = Date.now().toString(36);
const studentName = `Sita Paudel ${run}`;
test.describe.configure({ mode: 'serial' });
const nav = (name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_EDITOR2_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(nav('Orders')).toBeVisible();
  token = (
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
  const subject = await staff('POST', '/admin/subjects', { name: { en: `Economics ${run}` } });
  await staff('PUT', `/admin/subjects/${subject.id}/status`, { status: 'published' });
  const course = await staff('POST', '/admin/courses', {
    slug: `econ-${run}`,
    title: { en: `Economics ${run}` },
  });
  // Test price, not a business value.
  await staff('PUT', `/admin/courses/${course.id}/pricing`, {
    pricePaisa: 99_900,
    salePricePaisa: null,
    saleStartsAt: null,
    saleEndsAt: null,
    validityType: 'lifetime',
    validityDays: null,
    validityEndsOn: null,
  });
  await staff('PUT', `/admin/courses/${course.id}/subjects`, { subjects: [{ subjectId: subject.id }] });
  await staff('PUT', `/admin/courses/${course.id}/publishing`, { status: 'published' });

  // The student buys on Android and pays at Khalti, then closes the app before coming back.
  const registered = await page.request.post('/api/v1/auth/register', {
    data: {
      fullName: studentName,
      email: `sita.${run}@example.com`,
      password: 'paid but gone',
      acceptTerms: true,
      device: { deviceId: `e2e-order-${run}`, deviceName: 'E2E', platform: 'android' },
    },
  });
  const student = ((await registered.json()) as { accessToken: string }).accessToken;
  const asStudent = { Authorization: `Bearer ${student}`, 'X-TK-Platform': 'android' };
  const order = (await (
    await page.request.post('/api/v1/orders', { data: { courseId: course.id }, headers: asStudent })
  ).json()) as { id: string; orderNo: number };
  orderNumber = `#${String(order.orderNo).padStart(6, '0')}`;
  const started = (await (
    await page.request.post(`/api/v1/orders/${order.id}/pay`, {
      data: { provider: 'khalti', returnTo: 'app' },
      headers: asStudent,
    })
  ).json()) as { redirectUrl: string };
  const confirm = new URL(started.redirectUrl);
  confirm.pathname = '/khalti/pay/confirm';
  confirm.searchParams.set('action', 'pay');
  // Paid at the gateway; the redirect back is never followed.
  expect((await page.request.get(confirm.toString(), { maxRedirects: 0 })).status()).toBe(302);
});
test.afterAll(async () => {
  await page.close();
});

test('staff check a payment the student never came back from', async () => {
  await nav('Orders').click();
  await expect(page.getByRole('heading', { name: 'Orders', level: 1 })).toBeVisible();
  await page.getByLabel('Search orders').fill(studentName);
  const row = page.getByRole('row', { name: new RegExp(studentName) });
  await expect(row.getByText('Not paid')).toBeVisible();
  await expect(row.getByText('Khalti · Started')).toBeVisible();
  await expect(row.getByText('Rs 999')).toBeVisible();

  await row.getByRole('link', { name: orderNumber }).click();
  await expect(page.getByRole('heading', { name: `Order ${orderNumber}` })).toBeVisible();
  await expect(page.getByText('None (not paid).')).toBeVisible();
  await page.getByRole('button', { name: 'Check with Khalti' }).click();
  await expect(page.getByText('Checked with Khalti: Completed')).toBeVisible();
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('no end date')).toBeVisible();

  await page.getByRole('button', { name: /Gateway messages/ }).click();
  await expect(page.getByText('staff → completed')).toBeVisible();
  await expect(page.getByText('initiate → initiated')).toBeVisible();
});
