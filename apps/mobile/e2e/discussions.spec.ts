import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_STUDENT3_EMAIL } from '@tk/e2e-support/accounts';
import { apiCall, editorToken } from './helpers';

/**
 * Phase 13d against the real API (S12, D-066): a question's discussion opens once the student has answered it; the
 * student asks, a teacher answers (best answer), the student is told and can report a post; lessons have one too.
 */
const run = Date.now().toString(36);
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
const doubt = `Why is the answer not Pokhara? ${run}`;
const teacherAnswer = `Kathmandu has been the capital since 1768 ${run}`;
let token = '';
let questionId = '';
let lessonId = '';

let page: Page;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, request }) => {
  token = await editorToken(request);
  const call = <T = { id: string }>(method: 'POST' | 'PUT', p: string, data?: unknown) =>
    apiCall<T>(request, token, method, p, data);
  const subject = await call('POST', '/admin/subjects', { name: { en: `Discussed ${run}` } });
  await call('PUT', `/admin/subjects/${subject.id}/status`, { status: 'published' });
  const chapter = await call('POST', `/admin/subjects/${subject.id}/chapters`, { title: { en: 'One' } });
  const topic = await call('POST', `/admin/chapters/${chapter.id}/topics`, { title: { en: 'One' } });
  for (const [level, id] of [
    ['chapters', chapter.id],
    ['topics', topic.id],
  ] as const) {
    await call('PUT', `/admin/${level}/${id}/status`, { status: 'published' });
  }
  const item = await call('POST', `/admin/topics/${topic.id}/items`, {
    type: 'note',
    title: { en: `Discussed lesson ${run}` },
    accessLevel: 'free',
    noteContent: doc('A free lesson.'),
  });
  await call('PUT', `/admin/learning-items/${item.id}/publishing`, { status: 'published' });
  lessonId = item.id;
  const q = await call('POST', '/admin/questions', {
    subjectId: subject.id,
    difficulty: 'easy',
    defaultMarks: 1,
    accessLevel: 'free',
    tags: [],
    content: {
      type: 'single_choice',
      stem: doc(`Which city is the capital of Nepal? ${run}`),
      options: [
        { id: 'a', content: doc('Pokhara') },
        { id: 'b', content: doc('Kathmandu') },
      ],
      correctOptionId: 'b',
    },
  });
  await call('PUT', `/admin/questions/${q.id}/status`, { status: 'published' });
  questionId = q.id;
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

test('a question discussion opens after answering; a teacher answers', async ({ request }) => {
  await page.goto('/');
  await visible(page.getByLabel('Email', { exact: true })).fill(E2E_STUDENT3_EMAIL);
  await visible(page.getByLabel('Password', { exact: true })).fill(E2E_ADMIN_PASSWORD);
  await button('Log in').click();
  const skip = button('Skip');
  if (
    await skip.waitFor({ state: 'visible', timeout: 5000 }).then(
      () => true,
      () => false,
    )
  )
    await skip.click();

  await page.goto(`/question/${questionId}`);
  // Not before the answer is shown.
  await expect(link('Discussion')).toHaveCount(0);
  await visible(page.getByRole('radio', { name: 'Pokhara' })).click();
  await button('Check answer').click();
  await link('Discussion').click();
  await expect(visible(page.getByRole('heading', { name: 'Discussion (0)' }))).toBeVisible();
  await expect(text('No questions yet. Ask the first one.')).toBeVisible();
  await button('Post').click();
  await expect(text('Write at least 2 characters.')).toBeVisible();
  await visible(page.getByLabel('Ask a question')).fill(doubt);
  await button('Post').click();
  await expect(text(doubt)).toBeVisible();
  await expect(text('You').first()).toBeVisible();

  // A teacher answers from the CMS and marks it as the best answer.
  const thread = await apiCall<{ data: Array<{ id: string }> }>(
    request,
    token,
    'GET',
    `/admin/discussions/question/${questionId}`,
  );
  const [post] = thread.data;
  const answer = await apiCall(request, token, 'POST', `/admin/discussions/question/${questionId}/posts`, {
    body: teacherAnswer,
    parentId: post!.id,
  });
  await apiCall(request, token, 'PUT', `/admin/discussions/posts/${answer.id}/best`);

  await page.reload();
  await expect(text(teacherAnswer)).toBeVisible();
  await expect(visible(page.getByText('Teacher', { exact: true }))).toBeVisible();
  await expect(visible(page.getByText('Best answer', { exact: true }))).toBeVisible();

  // Reporting a post.
  await visible(page.getByRole('button', { name: /^Report: / })).click();
  const dialog = visible(page.getByRole('dialog', { name: 'Report this post' }));
  await dialog.getByRole('radio', { name: 'Wrong or misleading' }).click();
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog.getByText('Thank you. Staff will check this post.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  // The reply was announced.
  await page.goto('/notifications');
  await expect(text('New reply to your question').first()).toBeVisible();
});

test('a lesson has its discussion too', async () => {
  await page.goto(`/learn/${lessonId}`);
  await link('Discussion').click();
  await expect(visible(page.getByRole('heading', { name: 'Discussion (0)' }))).toBeVisible();
  await expect(text(`Discussed lesson ${run}`)).toBeVisible();
});
