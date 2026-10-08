import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_STUDENT2_EMAIL } from '@tk/e2e-support/accounts';
import { E2E_WEB_ORIGIN } from './constants.mjs';
import { apiCall, editorToken } from './helpers';

/**
 * Phase 13a against the real API (S8, D-066): practice answers feed accuracy and strong topics, time spent
 * practising is measured by the app and sent to the API, and My progress shows it all (Profile and Home).
 */
const run = Date.now().toString(36);
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
const opt = (id: string, text: string) => ({ id, content: doc(text) });
const subjectName = `Constitution ${run}`;
const topicName = `Fundamental rights ${run}`;
let question = '';

let page: Page;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, request }) => {
  const token = await editorToken(request);
  const call = <T = { id: string }>(method: 'POST' | 'PUT', p: string, data?: unknown) =>
    apiCall<T>(request, token, method, p, data);
  const subject = await call('POST', '/admin/subjects', { name: { en: subjectName } });
  const chapter = await call('POST', `/admin/subjects/${subject.id}/chapters`, {
    numberLabel: '1',
    title: { en: 'Part 3' },
  });
  const topic = await call('POST', `/admin/chapters/${chapter.id}/topics`, {
    numberLabel: '1.1',
    title: { en: topicName },
  });
  for (const [level, id] of [
    ['subjects', subject.id],
    ['chapters', chapter.id],
    ['topics', topic.id],
  ] as const) {
    await call('PUT', `/admin/${level}/${id}/status`, { status: 'published' });
  }
  const q = await call('POST', '/admin/questions', {
    subjectId: subject.id,
    topicId: topic.id,
    difficulty: 'easy',
    defaultMarks: 1,
    accessLevel: 'free',
    tags: [],
    content: {
      type: 'single_choice',
      stem: doc(`Which article guarantees the right to equality? ${run}`),
      options: [opt('a', 'Article 18'), opt('b', 'Article 51')],
      correctOptionId: 'a',
    },
  });
  await call('PUT', `/admin/questions/${q.id}/status`, { status: 'published' });
  question = q.id;

  // A seeded student (sign-up allows 10 accounts per IP per hour; the suite runs from one IP).
  const login = await request.post(`${E2E_WEB_ORIGIN}/api/v1/auth/login`, {
    data: {
      email: E2E_STUDENT2_EMAIL,
      password: E2E_ADMIN_PASSWORD,
      device: { deviceId: `e2e-progress-${run}`, deviceName: 'E2E', platform: 'web' },
    },
  });
  expect(login.ok(), await login.text()).toBe(true);
  const studentToken = ((await login.json()) as { accessToken: string }).accessToken;
  // Five correct practice answers: enough for the topic to count (CMS default: at least 5 answers).
  for (let i = 0; i < 5; i++) {
    const checked = await request.post(`${E2E_WEB_ORIGIN}/api/v1/practice-questions/${question}/check`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { response: { type: 'single_choice', optionId: 'a' } },
    });
    expect(checked.ok(), await checked.text()).toBe(true);
  }
  page = await browser.newPage();
});
test.afterAll(async () => {
  await page.close();
});

const visible = <T extends ReturnType<Page['getByRole']>>(l: T) => l.filter({ visible: true });
const button = (name: string | RegExp) =>
  visible(page.getByRole('button', { name, exact: typeof name === 'string' }));
const text = (value: string | RegExp) => visible(page.getByText(value));

test('time spent practising is measured and sent', async () => {
  await page.goto('/');
  await visible(page.getByLabel('Email', { exact: true })).fill(E2E_STUDENT2_EMAIL);
  await visible(page.getByLabel('Password', { exact: true })).fill(E2E_ADMIN_PASSWORD);
  await button('Log in').click();
  await button('Skip').click();

  await page.goto(`/question/${question}`);
  await visible(page.getByRole('radio', { name: 'Article 51' })).click();
  await page.waitForTimeout(2500);
  await button('Check answer').click();
  await expect(visible(page.getByRole('alert')).filter({ hasText: 'Not correct' })).toBeVisible();
  await page.waitForTimeout(1500);
  // Leaving the screen sends the practice time measured on it; the API credits it.
  const sent = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/me/study-time') && r.request().method() === 'POST',
  );
  await visible(page.getByRole('button', { name: 'Back' })).click();
  const response = await sent;
  expect(response.request().postDataJSON()).toMatchObject({ activity: 'practice' });
  expect(response.request().postDataJSON().seconds).toBeGreaterThanOrEqual(3);
  expect(((await response.json()) as { credited: number }).credited).toBeGreaterThanOrEqual(3);
});

test('My progress shows accuracy, subjects and strong topics', async () => {
  await page.goto('/profile');
  await visible(page.getByRole('link', { name: 'My progress' })).click();
  await expect(visible(page.getByRole('heading', { name: 'My progress' }))).toBeVisible();
  // 5 correct + 1 wrong.
  await expect(text('83%').first()).toBeVisible();
  await expect(text('5 correct · 0 partly correct · 1 wrong')).toBeVisible();
  await expect(visible(page.getByText(subjectName, { exact: true }))).toBeVisible();
  await expect(text('83% · 6 answers').first()).toBeVisible();
  await expect(text(topicName)).toBeVisible();
  await expect(text('Topics at 80% or more, with at least 5 answers.')).toBeVisible();
  await expect(text('Not enough answers yet.')).toBeVisible();
  await expect(text('Your released test results appear here.')).toBeVisible();
  // Each day's bar is announced with its time.
  await expect(visible(page.getByRole('img', { name: /: \d+ min$/ })).first()).toBeVisible();

  // Home shows this week's summary and opens the same page.
  await page.goto('/');
  const link = visible(page.getByRole('link', { name: 'My progress' }));
  await expect(link).toContainText('accuracy 83%');
  await link.click();
  await expect(visible(page.getByRole('heading', { name: 'My progress' }))).toBeVisible();
});
