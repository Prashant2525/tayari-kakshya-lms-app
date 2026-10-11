import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_STUDENT3_EMAIL } from '@tk/e2e-support/accounts';
import { E2E_WEB_ORIGIN } from './constants.mjs';
import { apiCall, editorToken } from './helpers';

/**
 * Phase 13c against the real API (S4, D-066): a student who has finished enough of a course writes a review; it waits
 * for staff; once approved, it and the course's rating appear on the course page.
 */
const run = Date.now().toString(36);
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
const slug = `reviewed-${run}`;
const courseTitle = `Reviewed course ${run}`;
const reviewText = `Short notes that are easy to revise ${run}`;
let token = '';
let courseId = '';
let lessonId = '';

let page: Page;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, request }) => {
  token = await editorToken(request);
  const call = <T = { id: string }>(method: 'POST' | 'PUT', p: string, data?: unknown) =>
    apiCall<T>(request, token, method, p, data);
  const subject = await call('POST', '/admin/subjects', { name: { en: `Reviewed subject ${run}` } });
  const chapter = await call('POST', `/admin/subjects/${subject.id}/chapters`, { title: { en: 'One' } });
  const topic = await call('POST', `/admin/chapters/${chapter.id}/topics`, { title: { en: 'One' } });
  for (const [level, id] of [
    ['subjects', subject.id],
    ['chapters', chapter.id],
    ['topics', topic.id],
  ] as const) {
    await call('PUT', `/admin/${level}/${id}/status`, { status: 'published' });
  }
  const item = await call('POST', `/admin/topics/${topic.id}/items`, {
    type: 'note',
    title: { en: `Only lesson ${run}` },
    accessLevel: 'free',
    noteContent: doc('Everything in one note.'),
  });
  await call('PUT', `/admin/learning-items/${item.id}/publishing`, { status: 'published' });
  lessonId = item.id;
  const course = await call('POST', '/admin/courses', { slug, title: { en: courseTitle } });
  await call('PUT', `/admin/courses/${course.id}/subjects`, { subjects: [{ subjectId: subject.id }] });
  await call('PUT', `/admin/courses/${course.id}/publishing`, { status: 'published' });
  courseId = course.id;
  page = await browser.newPage();
});
test.afterAll(async () => {
  await page.close();
});

const visible = <T extends ReturnType<Page['getByRole']>>(l: T) => l.filter({ visible: true });
const button = (name: string | RegExp) =>
  visible(page.getByRole('button', { name, exact: typeof name === 'string' }));
const text = (value: string | RegExp) => visible(page.getByText(value));

test('a student who finished enough of a course reviews it; staff approve it', async ({ request }) => {
  await page.goto('/');
  await visible(page.getByLabel('Email', { exact: true })).fill(E2E_STUDENT3_EMAIL);
  await visible(page.getByLabel('Password', { exact: true })).fill(E2E_ADMIN_PASSWORD);
  await button('Log in').click();
  // Onboarding is offered until the student chooses or skips it once.
  const skip = button('Skip');
  if (
    await skip.waitFor({ state: 'visible', timeout: 5000 }).then(
      () => true,
      () => false,
    )
  )
    await skip.click();

  await page.goto(`/course/${slug}`);
  await button('Enrol for free').click();
  await expect(visible(page.getByRole('heading', { name: 'Reviews' }))).toBeVisible();
  await expect(text('No reviews yet.')).toBeVisible();
  // CMS default: a fifth of the lessons first.
  await expect(text('Finish 20% of the lessons to review this course (you have finished 0%).')).toBeVisible();

  await page.goto(`/learn/${lessonId}?courseId=${courseId}`);
  await button('Mark as finished').click();
  await page.goto(`/course/${slug}`);
  await button('Write a review').click();
  const dialog = visible(page.getByRole('dialog', { name: 'Write a review' }));
  await dialog.getByRole('button', { name: 'Send review' }).click();
  await expect(dialog.getByText('Choose from 1 to 5 stars.')).toBeVisible();
  await dialog.getByRole('radio', { name: '5 stars' }).click();
  await dialog.getByLabel('What did you think? (optional)').fill(reviewText);
  await dialog.getByRole('button', { name: 'Send review' }).click();
  await expect(text('Waiting for approval')).toBeVisible();
  await expect(text(reviewText)).toHaveCount(1);

  // Staff approve it (the CMS side has its own browser test).
  const pending = await request.get(
    `${E2E_WEB_ORIGIN}/api/v1/admin/reviews?status=pending&courseId=${courseId}`,
    {
      headers: { Authorization: `Bearer ${token}`, 'X-TK-Client': 'admin' },
    },
  );
  const [review] = ((await pending.json()) as { data: Array<{ id: string }> }).data;
  await apiCall(request, token, 'POST', `/admin/reviews/${review!.id}/approve`);

  await page.reload();
  await expect(text('Published')).toBeVisible();
  await expect(
    visible(page.getByRole('img', { name: 'Rated 5 out of 5 from 1 review' })).first(),
  ).toBeVisible();
  // Shown publicly (in the list) as well as in the student's own card.
  await expect(text(reviewText)).toHaveCount(2);
});
