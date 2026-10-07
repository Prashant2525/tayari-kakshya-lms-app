import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_EDITOR3_EMAIL, E2E_STUDENT_EMAIL } from './e2e-env.mjs';
import { pngFixture } from './fixtures';

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

test('an iPhone student who opened a paid course is listed, and staff email them the link', async () => {
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
  // A paid, published course (test price, not a business value).
  const subject = await staff('POST', '/admin/subjects', { name: { en: `Nepali ${run}` } });
  await staff('PUT', `/admin/subjects/${subject.id}/status`, { status: 'published' });
  const course = await staff('POST', '/admin/courses', {
    slug: `kharidar-${run}`,
    title: { en: `Kharidar Complete ${run}` },
  });
  await staff('PUT', `/admin/courses/${course.id}/pricing`, {
    pricePaisa: 150_000,
    salePricePaisa: null,
    saleStartsAt: null,
    saleEndsAt: null,
    validityType: 'lifetime',
    validityDays: null,
    validityEndsOn: null,
  });
  await staff('PUT', `/admin/courses/${course.id}/subjects`, { subjects: [{ subjectId: subject.id }] });
  await staff('PUT', `/admin/courses/${course.id}/publishing`, { status: 'published' });

  // The seeded student opens it on an iPhone: no price there, the visit is noted quietly (D-061).
  const login = await page.request.post('/api/v1/auth/login', {
    data: {
      email: E2E_STUDENT_EMAIL,
      password: E2E_ADMIN_PASSWORD,
      device: { deviceId: `e2e-iphone-${run}`, deviceName: 'iPhone 15', platform: 'ios' },
    },
  });
  expect(login.ok(), await login.text()).toBe(true);
  const student = ((await login.json()) as { accessToken: string }).accessToken;
  const opened = await page.request.get(`/api/v1/courses/kharidar-${run}`, {
    headers: { Authorization: `Bearer ${student}`, 'X-TK-Platform': 'ios' },
  });
  expect(opened.ok()).toBe(true);

  await nav('Interested on iPhone').click();
  const row = page.getByRole('row', { name: new RegExp(`Kharidar Complete ${run}`) });
  await expect(row).toContainText('iPhone 15');
  await expect(row).toContainText('Not emailed');
  await row.getByRole('button', { name: /Email .* the link/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Subject')).toHaveValue(`Kharidar Complete ${run} on Tayari Kakshya`);
  await expect(dialog).toContainText(`/courses/kharidar-${run}`);
  await dialog.getByRole('button', { name: 'Send email' }).click();
  await expect(page.getByText(/Email sent to/)).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(`Kharidar Complete ${run}`) })).toHaveCount(0);
  await page.getByLabel('Show').selectOption('contacted');
  await expect(page.getByRole('row', { name: new RegExp(`Kharidar Complete ${run}`) })).toContainText(
    'Emailed',
  );
});

test('staff write a weekly current-affairs digest in a category and publish it', async () => {
  await nav('Articles').click();
  await expect(page.getByRole('heading', { name: 'Articles', level: 1 })).toBeVisible();
  // Categories per kind.
  await page.getByRole('button', { name: 'Categories' }).click();
  const dialog = page.getByRole('dialog', { name: 'Article categories' });
  await dialog.getByLabel('Name (English)').fill(`Economy ${run}`);
  await dialog.getByRole('button', { name: 'Add category' }).click();
  await expect(dialog.getByText(`Economy ${run}`)).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('link', { name: 'New article' }).click();
  await page.getByLabel('Title (English)').fill(`Budget week ${run}: what changed`);
  // The web address follows the English title.
  await expect(page.getByLabel('Web address')).toHaveValue(`budget-week-${run}-what-changed`);
  await page.getByLabel('Category').selectOption({ label: `Economy ${run}` });
  await page.getByLabel('Period').selectOption('weekly');
  await page.getByRole('textbox', { name: 'Article (English)' }).click();
  await page.keyboard.type('The budget raised spending on education and roads.');
  // The date it covers is needed for current affairs.
  await page.getByRole('button', { name: 'Create article' }).click();
  await expect(page.getByText('Choose the date it covers').first()).toBeVisible();
  await page.getByLabel(/Date it covers/).fill('2026-10-04');
  await page.getByRole('button', { name: 'Create article' }).click();
  await expect(page.getByText('Article created')).toBeVisible();
  await page.getByLabel('Article status').selectOption('published');
  await page.getByRole('button', { name: 'Update status' }).click();
  await expect(page.getByText('Status: Published')).toBeVisible();

  await page.getByRole('main').getByRole('link', { name: 'Articles' }).click();
  const row = page.getByRole('row', { name: new RegExp(`Budget week ${run}`) });
  await expect(row).toContainText('Current affairs · Weekly');
  await expect(row).toContainText(`Economy ${run}`);
  await expect(row).toContainText('Published');
});

test('pages start as drafts that cannot be published; FAQs and contact options are added', async () => {
  await nav('Pages').click();
  await expect(page.getByRole('heading', { name: 'Pages', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Terms of use' }).click();
  await expect(page.getByText('Not ready to publish')).toBeVisible();
  await expect(page.getByText('Delete the DRAFT line at the top')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled();

  await nav('Help & support').click();
  await page.getByRole('button', { name: 'Add a question' }).click();
  let dialog = page.getByRole('dialog', { name: 'Add a question' });
  await dialog.getByLabel('Question (English)').fill(`Can I study offline? ${run}`);
  await dialog.getByLabel('Answer (English)').fill('Yes: download PDFs and videos in the app.');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(`Can I study offline? ${run}`)).toBeVisible();

  await page.getByRole('button', { name: 'Add a contact option' }).click();
  dialog = page.getByRole('dialog', { name: 'Add a contact option' });
  await dialog.getByLabel('Type').selectOption('whatsapp');
  await dialog.getByLabel('Value').fill('call us');
  await dialog.getByLabel('Label (English)').fill(`WhatsApp ${run}`);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText(/Enter a phone number/)).toBeVisible();
  await dialog.getByLabel('Value').fill('+977 9800000000');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(`WhatsApp ${run}`)).toBeVisible();
});

test('staff add a scheduled banner with a picture; a web link is checked and not shown on iPhone', async () => {
  await nav('Media library').click();
  await page
    .getByLabel('Upload files')
    .setInputFiles([{ name: `banner-${run}.png`, mimeType: 'image/png', buffer: pngFixture(1600, 700) }]);
  await expect(page.getByRole('button', { name: new RegExp(`banner-${run}\\.png`) })).toBeVisible();

  await nav('Banners').click();
  await page.getByRole('button', { name: 'New banner' }).click();
  const dialog = page.getByRole('dialog', { name: 'New banner' });
  await dialog.getByRole('button', { name: 'Choose' }).click();
  await page
    .getByRole('dialog', { name: 'Choose an image' })
    .getByRole('button', { name: new RegExp(`banner-${run}\\.png`) })
    .click();
  await dialog.getByLabel('Title (English)').fill(`Dashain offer ${run}`);
  await dialog.getByLabel('Opens').selectOption('url');
  await dialog.getByLabel('Link').fill('http://insecure.example');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('Enter an https:// link').first()).toBeVisible();
  await dialog.getByLabel('Link').fill('https://tayarikakshya.com/dashain');
  await dialog.getByLabel('Ends (Nepal time)').fill('2099-01-01T10:00');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Banner saved')).toBeVisible();
  const row = page.getByRole('listitem').filter({ hasText: `Dashain offer ${run}` });
  await expect(row).toContainText('Showing');
  await expect(row).toContainText('Not on iPhone');
});
