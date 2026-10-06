import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_EDITOR2_EMAIL } from './e2e-env.mjs';

/**
 * Phase 11 part 2b in the CMS: staff create a coupon for one course, copy its share link, and see a student's order
 * with the coupon's discount.
 */
let page: Page;
const run = Date.now().toString(36);
const courseTitle = `Kharidar ${run}`;
const slug = `kharidar-${run}`;
const code = `E2E-${run}`.toUpperCase();
const studentName = `Gita Thapa ${run}`;
test.describe.configure({ mode: 'serial' });
const nav = (name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });
let staff: (method: 'POST' | 'PUT', path: string, data: unknown) => Promise<{ id: string }>;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_EDITOR2_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(nav('Coupons')).toBeVisible();
  const token = (
    (await (
      await page.request.post('/api/v1/admin/auth/refresh', { headers: { 'X-TK-Client': 'admin' } })
    ).json()) as { accessToken: string }
  ).accessToken;
  staff = async (method, path, data) => {
    const res = await page.request.fetch(`/api/v1${path}`, {
      method,
      data,
      headers: { Authorization: `Bearer ${token}`, 'X-TK-Client': 'admin' },
    });
    expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true);
    return (res.status() === 204 ? null : await res.json()) as { id: string };
  };
  const subject = await staff('POST', '/admin/subjects', { name: { en: `Nepali ${run}` } });
  await staff('PUT', `/admin/subjects/${subject.id}/status`, { status: 'published' });
  const course = await staff('POST', '/admin/courses', { slug, title: { en: courseTitle } });
  // Test price, not a business value.
  await staff('PUT', `/admin/courses/${course.id}/pricing`, {
    pricePaisa: 200_000,
    salePricePaisa: null,
    saleStartsAt: null,
    saleEndsAt: null,
    validityType: 'lifetime',
    validityDays: null,
    validityEndsOn: null,
  });
  await staff('PUT', `/admin/courses/${course.id}/subjects`, { subjects: [{ subjectId: subject.id }] });
  await staff('PUT', `/admin/courses/${course.id}/publishing`, { status: 'published' });
});
test.afterAll(async () => {
  await page.close();
});

test('staff create a coupon for one course and copy its share link', async () => {
  await nav('Coupons').click();
  await expect(page.getByRole('heading', { name: 'Coupons', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'New coupon' }).click();
  await page.getByLabel('Code').fill(code.toLowerCase());
  await expect(page.getByLabel('Code')).toHaveValue(code);
  await page.getByLabel('Staff note').fill('E2E festival offer');
  await page.getByLabel('Percent off').fill('25');
  await page.getByLabel('Applies to').selectOption('selected');
  await page.getByRole('checkbox', { name: courseTitle }).check();
  await page.getByLabel('Total uses').fill('5');
  await page.getByRole('button', { name: 'Create coupon' }).click();
  await expect(page.getByText('Coupon created')).toBeVisible();
  await expect(page.getByRole('heading', { name: code, level: 1 })).toBeVisible();
  await expect(page.getByText('25% off')).toBeVisible();

  await page.getByLabel('Link to').selectOption({ label: courseTitle });
  await expect(page.getByLabel('Share link')).toHaveValue(new RegExp(`/checkout/${slug}\\?coupon=${code}$`));

  await page.getByRole('link', { name: 'Coupons' }).first().click();
  await page.getByLabel('Search coupons').fill(code);
  const row = page.getByRole('row', { name: new RegExp(code) });
  await expect(row.getByText('Chosen courses and plans')).toBeVisible();
  await expect(row.getByText('0 / 5')).toBeVisible();
  await expect(row.getByText('Active')).toBeVisible();
});

test('an order shows the coupon and its discount', async () => {
  const registered = await page.request.post('/api/v1/auth/register', {
    data: {
      fullName: studentName,
      email: `gita.${run}@example.com`,
      password: 'coupon student',
      acceptTerms: true,
      device: { deviceId: `e2e-coupon-${run}`, deviceName: 'E2E', platform: 'android' },
    },
  });
  const student = ((await registered.json()) as { accessToken: string }).accessToken;
  const course = (await (await page.request.get(`/api/v1/courses/${slug}`)).json()) as { id: string };
  const order = await page.request.post('/api/v1/orders', {
    data: { courseId: course.id, couponCode: code.toLowerCase() },
    headers: { Authorization: `Bearer ${student}`, 'X-TK-Platform': 'android' },
  });
  expect(order.ok(), await order.text()).toBe(true);

  await nav('Orders').click();
  await page.getByLabel('Search orders').fill(studentName);
  const row = page.getByRole('row', { name: new RegExp(studentName) });
  await expect(row.getByText('Rs 1,500')).toBeVisible();
  await row.getByRole('link', { name: /#\d{6}/ }).click();
  await expect(page.getByRole('link', { name: code })).toBeVisible();
  await expect(page.getByText('− Rs 500')).toBeVisible();
});
