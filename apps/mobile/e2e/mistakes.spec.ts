import { expect, test, type Page } from '@playwright/test';
import { E2E_WEB_ORIGIN } from './constants.mjs';
import { apiCall, editorToken } from './helpers';

/**
 * §10 part 3c against the real API: a wrong practice answer is saved to the mistake notebook; revising it correctly
 * twice in a row (the default CMS number) masters it; another question is removed by the student (D-050).
 */
const run = Date.now().toString(36);
const password = 'learn from mistakes';
const email = `mistakes.${run}@example.com`;
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
const opt = (id: string, text: string) => ({ id, content: doc(text) });
const capitalStem = `Which city is the capital of Nepal? ${run}`;
const riverStem = `Which river flows past Devghat? ${run}`;
let capital = '';
let river = '';

let page: Page;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, request }) => {
  const token = await editorToken(request);
  const call = <T = { id: string }>(method: 'POST' | 'PUT', p: string, data?: unknown) =>
    apiCall<T>(request, token, method, p, data);
  const subject = await call('POST', '/admin/subjects', { name: { en: `Geography ${run}` } });
  await call('PUT', `/admin/subjects/${subject.id}/status`, { status: 'published' });
  const question = async (stem: string, options: Array<[string, string]>, correctOptionId: string) => {
    const q = await call('POST', '/admin/questions', {
      subjectId: subject.id,
      difficulty: 'easy',
      defaultMarks: 1,
      accessLevel: 'free',
      tags: [],
      content: {
        type: 'single_choice',
        stem: doc(stem),
        options: options.map(([id, t]) => opt(id, t)),
        correctOptionId,
      },
    });
    await call('PUT', `/admin/questions/${q.id}/status`, { status: 'published' });
    return q.id;
  };
  capital = await question(
    capitalStem,
    [
      ['a', 'Pokhara'],
      ['b', 'Kathmandu'],
    ],
    'b',
  );
  river = await question(
    riverStem,
    [
      ['a', 'Kali Gandaki'],
      ['b', 'Bagmati'],
    ],
    'a',
  );

  const registered = await request.post(`${E2E_WEB_ORIGIN}/api/v1/auth/register`, {
    data: {
      fullName: 'Sarita Thapa',
      email,
      password,
      acceptTerms: true,
      device: { deviceId: `e2e-mistakes-${run}`, deviceName: 'E2E', platform: 'web' },
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
const text = (value: string | RegExp) => visible(page.getByText(value));
const option = (name: string) => visible(page.getByRole('radio', { name }));

test('a wrong practice answer goes into the notebook', async () => {
  await page.goto('/');
  await visible(page.getByLabel('Email', { exact: true })).fill(email);
  await visible(page.getByLabel('Password', { exact: true })).fill(password);
  await button('Log in').click();
  await button('Skip').click();

  for (const [id, wrong] of [
    [capital, 'Pokhara'],
    [river, 'Bagmati'],
  ] as const) {
    await page.goto(`/question/${id}`);
    await option(wrong).click();
    await button('Check answer').click();
    await expect(visible(page.getByRole('alert')).filter({ hasText: 'Not correct' })).toBeVisible();
    await expect(text('Saved to your mistake notebook.')).toBeVisible();
  }
});

test('revising it correctly twice masters it; removing another', async () => {
  await page.goto('/profile');
  await visible(page.getByRole('link', { name: 'Mistake notebook' })).click();
  await expect(text('2 to revise · 0 mastered')).toBeVisible();
  await expect(
    text('Answer a question correctly 2 times in a row and it leaves your notebook.'),
  ).toBeVisible();

  const card = visible(page.getByRole('group').filter({ hasText: capitalStem }));
  await card.getByRole('radio', { name: 'Kathmandu' }).click();
  await card.getByRole('button', { name: 'Check answer' }).click();
  await expect(card.getByRole('status').filter({ hasText: /^Correct$/ })).toBeVisible();
  await expect(card.getByText('Correct 1 of 2 in a row')).toBeVisible();
  await card.getByRole('button', { name: 'Try again' }).click();
  await card.getByRole('radio', { name: 'Kathmandu' }).click();
  await card.getByRole('button', { name: 'Check answer' }).click();
  await expect(text('Mastered — it leaves your notebook.')).toBeVisible();

  const other = visible(page.getByRole('group').filter({ hasText: riverStem }));
  await other.getByRole('button', { name: 'Remove from notebook' }).click();
  await expect(text(riverStem)).toHaveCount(0);

  await page.reload();
  await expect(text('0 to revise · 1 mastered')).toBeVisible();
  await expect(text('Nothing to revise')).toBeVisible();
});
