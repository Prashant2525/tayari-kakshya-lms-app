import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_EDITOR2_EMAIL } from './e2e-env.mjs';

/**
 * §10 part 3b in the CMS: write a certificate template, preview it, choose it for a course; a student who finishes the
 * course's lessons receives it automatically; staff find it, revoke it (with a reason) and reinstate it (D-050).
 */
let page: Page;
let token = '';
let student = '';
let courseId = '';
let itemId = '';
const run = Date.now().toString(36);
const templateName = `Completion ${run}`;
const studentName = `Hari Bista ${run}`;
test.describe.configure({ mode: 'serial' });
const nav = (name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });

async function api<T = { id: string }>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  data?: unknown,
  as = 'staff',
) {
  const res = await page.request.fetch(`/api/v1${path}`, {
    method,
    ...(data === undefined ? {} : { data }),
    headers:
      as === 'staff'
        ? { Authorization: `Bearer ${token}`, 'X-TK-Client': 'admin' }
        : as === 'student'
          ? { Authorization: `Bearer ${student}` }
          : {},
  });
  expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true);
  return (res.status() === 204 ? null : await res.json()) as T;
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_EDITOR2_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(nav('Certificates')).toBeVisible();
  token = (
    (await (
      await page.request.post('/api/v1/admin/auth/refresh', { headers: { 'X-TK-Client': 'admin' } })
    ).json()) as { accessToken: string }
  ).accessToken;

  // A published course with one lesson.
  const subject = await api('POST', '/admin/subjects', { name: { en: `Constitution ${run}` } });
  const chapter = await api('POST', `/admin/subjects/${subject.id}/chapters`, {
    numberLabel: '1',
    title: { en: 'Basics' },
  });
  const topic = await api('POST', `/admin/chapters/${chapter.id}/topics`, {
    numberLabel: '1.1',
    title: { en: 'Preamble' },
  });
  for (const [level, id] of [
    ['subjects', subject.id],
    ['chapters', chapter.id],
    ['topics', topic.id],
  ] as const) {
    await api('PUT', `/admin/${level}/${id}/status`, { status: 'published' });
  }
  const item = await api('POST', `/admin/topics/${topic.id}/items`, {
    type: 'note',
    title: { en: 'The preamble' },
    accessLevel: 'free',
    noteContent: {
      en: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We the people' }] }],
      },
    },
  });
  itemId = item.id;
  await api('PUT', `/admin/learning-items/${itemId}/publishing`, { status: 'published' });
  const course = await api('POST', '/admin/courses', {
    slug: `constitution-${run}`,
    title: { en: `Constitution course ${run}` },
  });
  courseId = course.id;
  await api('PUT', `/admin/courses/${courseId}/subjects`, { subjects: [{ subjectId: subject.id }] });
  await api('PUT', `/admin/courses/${courseId}/publishing`, { status: 'published' });

  const registered = await page.request.post('/api/v1/auth/register', {
    data: {
      fullName: studentName,
      email: `hari.${run}@example.com`,
      password: 'certificates for all',
      acceptTerms: true,
      device: { deviceId: `e2e-cert-${run}`, deviceName: 'E2E', platform: 'web' },
    },
  });
  student = ((await registered.json()) as { accessToken: string }).accessToken;
  const me = await api<{ id: string }>('GET', '/me', undefined, 'student');
  await api('POST', `/admin/users/${me.id}/entitlements`, { courseId, endsAt: null });
});
test.afterAll(async () => {
  await page.close();
});

test('write a template, preview it and choose it for a course', async () => {
  await nav('Certificates').click();
  await expect(page.getByRole('heading', { name: 'Certificates', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'New template' }).click();

  await page.getByLabel('Template name').fill(templateName);
  await page.getByLabel('Lessons to finish (%)').fill('0');
  await page.getByLabel('Issuer (English)').fill('E2E Academy');
  await page.getByLabel('Title (English)', { exact: true }).fill('Certificate of Completion');
  await page.getByLabel('Before the course (English)').fill('has completed the course');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Lessons to finish must be a whole number from 1 to 100')).toBeVisible();
  await page.getByLabel('Lessons to finish (%)').fill('100');
  await page.getByRole('button', { name: 'Add signatory' }).click();
  await page.getByLabel('Name (English)', { exact: true }).fill('Sita Karki');
  await page.getByLabel('Role (English)', { exact: true }).fill('Director');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Template saved')).toBeVisible();
  await expect(page.getByRole('heading', { name: templateName, level: 1 })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download sample PDF' }).click();
  expect((await download).suggestedFilename()).toBe('certificate-preview.pdf');

  await page.goto(`/courses/${courseId}?tab=certificate`);
  await page.getByLabel('Certificate template').selectOption({ label: templateName });
  await expect(page.getByText('100% of lessons to finish')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Certificate saved')).toBeVisible();
});

test('a student who finishes the course receives it; staff revoke and reinstate it', async () => {
  const progress = await api<{ newCertificates: Array<{ code: string }> }>(
    'PUT',
    `/learning-items/${itemId}/progress`,
    { courseId, completed: true },
    'student',
  );
  expect(progress.newCertificates).toHaveLength(1);
  const code = progress.newCertificates[0]!.code;

  await page.goto('/certificates');
  await page.getByLabel('Search certificates').fill(code.toLowerCase());
  const row = page.getByRole('row', { name: new RegExp(studentName) });
  await expect(row.getByText(code)).toBeVisible();
  await expect(row.getByText('Valid')).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(templateName) }).getByText('1 course')).toBeVisible();

  await row.getByRole('button', { name: 'Revoke' }).click();
  const dialog = page.getByRole('dialog', { name: 'Revoke certificate?' });
  await dialog.getByLabel('Reason (kept in the audit log)').fill('Issued to the wrong account');
  await dialog.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByText('Certificate revoked')).toBeVisible();
  await expect(row.getByText('Revoked')).toBeVisible();
  await expect(row.getByText(/Issued to the wrong account/)).toBeVisible();
  expect((await api<{ status: string }>('GET', `/certificates/${code}`, undefined, 'public')).status).toBe(
    'revoked',
  );

  await row.getByRole('button', { name: 'Reinstate' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reinstate' }).click();
  await expect(page.getByText('Certificate reinstated')).toBeVisible();
  await expect(row.getByText('Valid')).toBeVisible();
  expect((await api<{ status: string }>('GET', `/certificates/${code}`, undefined, 'public')).status).toBe(
    'valid',
  );
});
