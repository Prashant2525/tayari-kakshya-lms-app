import { expect, test, type Page } from '@playwright/test';
import { E2E_WEB_ORIGIN } from './constants.mjs';
import { apiCall, editorToken } from './helpers';

/**
 * §10 part 3b against the real API: a free course with a certificate template (50 % of lessons) → enrol → the course
 * page shows the rule and progress → finishing a lesson earns the certificate (dialog) → Profile → Certificates →
 * the PDF opens by its number (D-049, D-050).
 */
const run = Date.now().toString(36);
const password = 'certificate please';
const email = `cert.${run}@example.com`;
const slug = `civics-${run}`;
const courseTitle = `Civics basics ${run}`;
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});

let page: Page;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, request }) => {
  const token = await editorToken(request);
  const call = <T = { id: string }>(method: 'POST' | 'PUT', p: string, data?: unknown) =>
    apiCall<T>(request, token, method, p, data);
  const subject = await call('POST', '/admin/subjects', { name: { en: `Civics ${run}` } });
  const chapter = await call('POST', `/admin/subjects/${subject.id}/chapters`, {
    numberLabel: '1',
    title: { en: 'Local government' },
  });
  const topic = await call('POST', `/admin/chapters/${chapter.id}/topics`, {
    numberLabel: '1.1',
    title: { en: 'Wards' },
  });
  for (const [level, id] of [
    ['subjects', subject.id],
    ['chapters', chapter.id],
    ['topics', topic.id],
  ] as const) {
    await call('PUT', `/admin/${level}/${id}/status`, { status: 'published' });
  }
  for (const [title, body] of [
    ['What a ward does', 'A ward is the smallest unit of local government.'],
    ['Ward committees', 'Each ward has an elected committee.'],
  ]) {
    const item = await call('POST', `/admin/topics/${topic.id}/items`, {
      type: 'note',
      title: { en: title },
      accessLevel: 'free',
      noteContent: doc(body as string),
    });
    await call('PUT', `/admin/learning-items/${item.id}/publishing`, { status: 'published' });
  }
  const course = await call('POST', '/admin/courses', { slug, title: { en: courseTitle } });
  await call('PUT', `/admin/courses/${course.id}/subjects`, { subjects: [{ subjectId: subject.id }] });
  await call('PUT', `/admin/courses/${course.id}/publishing`, { status: 'published' });
  // Template wording is test input; real wording is written in the CMS.
  const template = await call('POST', '/admin/certificate-templates', {
    name: `Civics ${run}`,
    language: 'en',
    requiredPercent: 50,
    title: { en: 'Certificate of Completion' },
    intro: null,
    statement: { en: 'has completed the course' },
    issuerName: { en: 'E2E Academy' },
    signatories: [],
    active: true,
  });
  await call('PUT', `/admin/courses/${course.id}/certificate`, { templateId: template.id });

  const registered = await request.post(`${E2E_WEB_ORIGIN}/api/v1/auth/register`, {
    data: {
      fullName: 'Nabin Shahi',
      email,
      password,
      acceptTerms: true,
      device: { deviceId: `e2e-cert-${run}`, deviceName: 'E2E', platform: 'web' },
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
const link = (name: string | RegExp) => visible(page.getByRole('link', { name }));
const text = (value: string | RegExp) => visible(page.getByText(value));

test('finishing half the lessons earns the certificate', async () => {
  await page.goto('/');
  await visible(page.getByLabel('Email', { exact: true })).fill(email);
  await visible(page.getByLabel('Password', { exact: true })).fill(password);
  await button('Log in').click();
  await button('Skip').click();

  await page.goto(`/course/${slug}`);
  await button('Enrol for free').click();
  await expect(text('You have access to this course.')).toBeVisible();
  await expect(text('Finish 50% of the lessons to earn the certificate.')).toBeVisible();
  await expect(text('0 of 2 lessons finished')).toBeVisible();

  await button('Start learning').click();
  await link('What a ward does').click();
  await button('Mark as finished').click();
  const dialog = visible(page.getByRole('dialog', { name: 'Certificate earned!' }));
  await expect(
    dialog.getByText(`You finished enough lessons of ${courseTitle} to earn its certificate.`),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'View certificate' }).click();

  await expect(visible(page.getByRole('heading', { name: 'Certificates' }))).toBeVisible();
  await expect(text(courseTitle)).toBeVisible();
  const number = await text(/^Certificate no\. /).textContent();
  const code = number!.replace('Certificate no. ', '');
  expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  // Headless Chromium has no PDF viewer: the new tab downloads it, so check the request the tab makes.
  const [opened] = await Promise.all([
    page.context().waitForEvent('request', (r) => r.url().includes('/certificates/')),
    button('Open certificate').click(),
  ]);
  expect(opened.url()).toContain(`/api/v1/certificates/${code}/pdf`);
  const res = await page.request.get(`${E2E_WEB_ORIGIN}/api/v1/certificates/${code}/pdf`);
  expect(res.headers()['content-type']).toBe('application/pdf');
});

test('the course page and Profile lead to it', async () => {
  await page.goto(`/course/${slug}`);
  await expect(text('You earned this course’s certificate.')).toBeVisible();
  await page.goto('/profile');
  await link('Certificates').click();
  await expect(text(courseTitle)).toBeVisible();
});
