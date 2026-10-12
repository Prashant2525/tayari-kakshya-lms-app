import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_EDITOR3_EMAIL, E2E_STUDENT_EMAIL } from './e2e-env.mjs';

/**
 * Live classes in the CMS (D-072): schedule a Zoom class, publish it, take it live, see who joined, end it and add the
 * recording.
 */
let page: Page;
let token = '';
let courseTitle = '';
const run = Date.now().toString(36);
const title = `Constitution live revision ${run}`;
test.describe.configure({ mode: 'serial' });
const nav = (name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });

async function staff(method: 'POST' | 'PUT', path: string, data: unknown) {
  const res = await page.request.fetch(`/api/v1${path}`, {
    method,
    data,
    headers: { Authorization: `Bearer ${token}`, 'X-TK-Client': 'admin' },
  });
  expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true);
  return (res.status() === 204 ? null : await res.json()) as { id: string };
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_EDITOR3_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(nav('Live classes')).toBeVisible();
  token = (
    (await (
      await page.request.post('/api/v1/admin/auth/refresh', { headers: { 'X-TK-Client': 'admin' } })
    ).json()) as { accessToken: string }
  ).accessToken;
  // A published course.
  const subject = await staff('POST', '/admin/subjects', { name: { en: `Constitution ${run}` } });
  await staff('PUT', `/admin/subjects/${subject.id}/status`, { status: 'published' });
  courseTitle = `Section Officer ${run}`;
  const course = await staff('POST', '/admin/courses', {
    slug: `so-live-${run}`,
    title: { en: courseTitle },
  });
  await staff('PUT', `/admin/courses/${course.id}/subjects`, { subjects: [{ subjectId: subject.id }] });
  await staff('PUT', `/admin/courses/${course.id}/publishing`, { status: 'published' });
});
test.afterAll(async () => {
  await page.close();
});

test('staff schedule a free Zoom class, publish it and take it live; a join is recorded', async () => {
  await nav('Live classes').click();
  await expect(page.getByRole('heading', { name: 'Live classes', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'New live class' }).click();
  await page.getByRole('button', { name: 'Create live class' }).click();
  await expect(page.getByText('Choose the course')).toBeVisible();

  await page.getByLabel('Course').selectOption({ label: courseTitle });
  await page.getByLabel('Title (English)').fill(title);
  await page.getByLabel('शीर्षक (नेपाली)').fill(`संविधान प्रत्यक्ष पुनरावृत्ति ${run}`);
  await page.getByLabel('Where it runs').selectOption('zoom');
  await page.getByLabel('Who can join').selectOption('free');
  // A YouTube link for a Zoom class is refused by the server.
  await page.getByLabel('Zoom meeting link').fill('https://youtube.com/live/abcdefghijk');
  // In two hours, Nepal time (UTC+5:45).
  const starts = new Date(Date.now() + 2 * 3_600_000 + 345 * 60_000).toISOString().slice(0, 16);
  await page.getByLabel('Starts at (Nepal time)').fill(starts);
  await page.getByLabel('Length (minutes)').fill('45');
  await page.getByRole('button', { name: 'Create live class' }).click();
  await expect(page.getByText('Use the Zoom meeting link (zoom.us)').first()).toBeVisible();
  await page.getByLabel('Zoom meeting link').fill('https://us02web.zoom.us/j/81234567890');
  await page.getByLabel('Meeting passcode').fill('tk2083');
  await page.getByRole('button', { name: 'Create live class' }).click();
  await expect(page.getByText('Live class created as a draft')).toBeVisible();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText('Draft').first()).toBeVisible();

  await page.getByRole('button', { name: 'Publish and notify' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published. Students of the course are told.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Attendance' })).toBeVisible();
  await expect(page.getByText('Nobody has joined yet')).toBeVisible();

  // Not open yet: the student is told when it opens and gets no link.
  const login = await page.request.post('/api/v1/auth/login', {
    data: {
      email: E2E_STUDENT_EMAIL,
      password: E2E_ADMIN_PASSWORD,
      device: { deviceId: `e2e-live-${run}`, deviceName: 'E2E', platform: 'android' },
    },
  });
  expect(login.ok(), await login.text()).toBe(true);
  const student = {
    Authorization: `Bearer ${((await login.json()) as { accessToken: string }).accessToken}`,
  };
  const id = page.url().split('/').at(-1)!;
  const early = await page.request.post(`/api/v1/live-classes/${id}/join`, { headers: student });
  expect(early.status()).toBe(409);
  const refused = await early.text();
  expect(refused).toContain('LIVE_CLASS_CLOSED');
  expect(refused).not.toContain('zoom.us');

  await page.getByRole('button', { name: 'Go live now' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Go live' }).click();
  await expect(page.getByText('The class is live. Students are told.')).toBeVisible();
  await expect(page.getByText('Live now').first()).toBeVisible();

  const joined = await page.request.post(`/api/v1/live-classes/${id}/join`, { headers: student });
  expect(joined.ok(), await joined.text()).toBe(true);
  expect(await joined.json()).toMatchObject({
    provider: 'zoom',
    joinUrl: 'https://us02web.zoom.us/j/81234567890',
    passcode: 'tk2083',
  });
  await page.reload();
  await expect(page.getByText('1 joined. Recorded when a student taps Join.')).toBeVisible();
  await expect(page.getByRole('cell', { name: /E2E Student/ })).toBeVisible();
});

test('staff end the class, add the recording and find it under Past', async () => {
  await page.getByRole('button', { name: 'End the class' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'End' }).click();
  await expect(page.getByText('The class has ended', { exact: true })).toBeVisible();
  await expect(
    page.getByText("This class has ended or was cancelled, so it can't be changed."),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

  await page.getByLabel('YouTube link').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Save recording' }).click();
  await expect(page.getByText('Recording saved')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove recording' })).toBeVisible();

  await page.getByRole('main').getByRole('link', { name: 'Live classes' }).click();
  await expect(page.getByRole('row', { name: new RegExp(title) })).toHaveCount(0);
  await page.getByLabel('Show').selectOption('past');
  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(row.getByText('Ended')).toBeVisible();
  await expect(row.getByText('Zoom')).toBeVisible();
  await expect(row.getByText('Free')).toBeVisible();
  await expect(row.getByRole('cell', { name: '1', exact: true })).toBeVisible();
});
