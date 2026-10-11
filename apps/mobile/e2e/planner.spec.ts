import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_STUDENT3_EMAIL } from '@tk/e2e-support/accounts';
import { apiCall, editorToken } from './helpers';

/**
 * Phase 13b against the real API (S7, D-066): a student makes a study plan for a course they have, sees today's
 * lessons, finishes one (ticked in the plan and on Home), and deletes the plan.
 */
const run = Date.now().toString(36);
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
const slug = `planner-${run}`;
const courseTitle = `Kharidar plan ${run}`;

let page: Page;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, request }) => {
  const token = await editorToken(request);
  const call = <T = { id: string }>(method: 'POST' | 'PUT', p: string, data?: unknown) =>
    apiCall<T>(request, token, method, p, data);
  const subject = await call('POST', '/admin/subjects', { name: { en: `General knowledge ${run}` } });
  const chapter = await call('POST', `/admin/subjects/${subject.id}/chapters`, {
    numberLabel: '1',
    title: { en: 'Geography' },
  });
  const topic = await call('POST', `/admin/chapters/${chapter.id}/topics`, {
    numberLabel: '1.1',
    title: { en: 'Rivers' },
  });
  for (const [level, id] of [
    ['subjects', subject.id],
    ['chapters', chapter.id],
    ['topics', topic.id],
  ] as const) {
    await call('PUT', `/admin/${level}/${id}/status`, { status: 'published' });
  }
  for (const [title, body] of [
    [`Koshi river ${run}`, 'The Koshi is the largest river of Nepal.'],
    [`Gandaki river ${run}`, 'The Gandaki flows through central Nepal.'],
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
const choose = async (field: string, option: string) => {
  await button(new RegExp(`^${field}:`)).click();
  await visible(
    page.getByRole('dialog', { name: field }).getByRole('option', { name: option, exact: true }),
  ).click();
};

test('a plan for a course spreads its lessons and ticks finished ones', async () => {
  await page.goto('/');
  await visible(page.getByLabel('Email', { exact: true })).fill(E2E_STUDENT3_EMAIL);
  await visible(page.getByLabel('Password', { exact: true })).fill(E2E_ADMIN_PASSWORD);
  await button('Log in').click();
  await button('Skip').click();
  // Plans are for courses the student has: join this free one.
  await page.goto(`/course/${slug}`);
  await button('Enrol for free').click();
  await expect(text('You have access to this course.')).toBeVisible();

  await page.goto('/');
  await link('Study planner').click();
  await expect(text('No study plan yet')).toBeVisible();
  await button('New plan').click();
  // The exam date must be after today.
  await button('Save plan').click();
  await expect(visible(page.getByRole('alert')).filter({ hasText: 'Choose a course.' })).toBeVisible();
  await choose('Course', courseTitle);
  // Next BS year, 1 Baisakh: always after today and within three years.
  await button(/^Year:/).click();
  const years = visible(page.getByRole('dialog', { name: 'Year' }).getByRole('option'));
  await years.nth(1).click();
  await choose('Month', 'Baisakh');
  await choose('Day', '1');
  await choose('Study time a day', '30 min');
  await button('Save plan').click();

  // Two 10-minute notes (CMS default estimate) fit in today's 30 minutes.
  await expect(visible(page.getByRole('heading', { name: courseTitle }))).toBeVisible();
  await expect(text('On track. Lessons left: 2 · tests left: 0 · about 20 min in all.')).toBeVisible();
  await expect(visible(page.getByRole('heading', { name: 'Today' }))).toBeVisible();
  await link(new RegExp(`^Koshi river ${run}, Note`)).click();
  await button('Mark as finished').click();
  await button('Back').click();
  await expect(text('1 of 2 done today')).toBeVisible();
  await expect(link(new RegExp(`^Koshi river ${run}, Note.*, done$`))).toBeVisible();
  await expect(text('On track. Lessons left: 1 · tests left: 0 · about 10 min in all.')).toBeVisible();

  // Home shows today's plan.
  await page.goto('/');
  await expect(visible(page.getByRole('heading', { name: "Today's plan" }))).toBeVisible();
  await expect(text('1 of 2 done today')).toBeVisible();
});

test('the plan can be deleted', async () => {
  await link('Open plan').click();
  await button('Change plan').click();
  await button('Delete plan').click();
  await visible(
    page.getByRole('dialog', { name: 'Delete plan' }).getByRole('button', { name: 'Delete plan' }),
  ).click();
  await expect(text('No study plan yet')).toBeVisible();
});
