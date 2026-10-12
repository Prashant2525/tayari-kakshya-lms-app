import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { E2E_WEB_ORIGIN } from './constants.mjs';
import { apiCall, editorToken, publishedNode, uploadPdf } from './helpers';

/**
 * §9 learning flow against the real API: catalog for the student's exam → course page (price / Enrol) → subject
 * outline → note (mark finished) → PDF in the self-hosted reader → video → Home "Continue". All content is created
 * through the CMS API first.
 */
const run = Date.now().toString(36);
const password = 'learning every day';
const email = `learner.${run}@example.com`;
const doc = (...blocks: unknown[]) => ({ en: { type: 'doc', content: blocks } });
const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const txt = (value: string, marks?: Array<{ type: string }>) => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});

let page: Page;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, request }) => {
  const token = await editorToken(request);
  const call = <T = { id: string }>(method: 'POST' | 'PUT', p: string, data?: unknown) =>
    apiCall<T>(request, token, method, p, data);

  const authority = await publishedNode(request, token, {
    parentId: null,
    nodeType: 'authority',
    name: { en: 'Nepal Police' },
    slug: `police-${run}`,
  });
  const post = await publishedNode(request, token, {
    parentId: authority,
    nodeType: 'post',
    name: { en: 'Constable' },
    slug: `constable-${run}`,
  });

  const subject = await call('POST', '/admin/subjects', { name: { en: 'Constitution' } });
  const chapter = await call('POST', `/admin/subjects/${subject.id}/chapters`, {
    numberLabel: '1',
    title: { en: 'Fundamental rights' },
  });
  const topic = await call('POST', `/admin/chapters/${chapter.id}/topics`, {
    numberLabel: '1.1',
    title: { en: 'Rights and duties' },
  });
  for (const [level, id] of [
    ['subjects', subject.id],
    ['chapters', chapter.id],
    ['topics', topic.id],
  ] as const) {
    await call('PUT', `/admin/${level}/${id}/status`, { status: 'published' });
  }
  const pdfMediaId = await uploadPdf(
    request,
    token,
    readFileSync(path.join(__dirname, 'fixtures', 'lesson.pdf')),
  );
  const items = [
    {
      type: 'note',
      title: { en: 'Right to equality' },
      accessLevel: 'free',
      noteContent: doc(
        { type: 'heading', attrs: { level: 2 }, content: [txt('Article 18')] },
        para(txt('All citizens are '), txt('equal before the law', [{ type: 'bold' }]), txt('.')),
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [para(txt('No discrimination in law'))] },
            { type: 'listItem', content: [para(txt('Equal protection of law'))] },
          ],
        },
      ),
    },
    {
      type: 'pdf',
      title: { en: 'Rights summary PDF' },
      accessLevel: 'free',
      pdfMediaId,
      downloadable: false,
    },
    {
      type: 'video',
      title: { en: 'Rights explained' },
      accessLevel: 'free',
      video: { provider: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' },
      durationSeconds: 212,
    },
  ];
  for (const body of items) {
    const item = await call('POST', `/admin/topics/${topic.id}/items`, body);
    await call('PUT', `/admin/learning-items/${item.id}/publishing`, { status: 'published' });
  }

  // A free course (Enrol) and a paid one (price shown on the web; checkout arrives with §11).
  for (const course of [
    { slug: `constable-free-${run}`, title: 'Constable Starter', price: 0 },
    { slug: `constable-full-${run}`, title: 'Constable Complete', price: 300_000 },
  ]) {
    const created = await call('POST', '/admin/courses', {
      slug: course.slug,
      title: { en: course.title },
      shortDescription: { en: 'Written exam preparation' },
    });
    await call('PUT', `/admin/courses/${created.id}/pricing`, {
      pricePaisa: course.price,
      salePricePaisa: null,
      saleStartsAt: null,
      saleEndsAt: null,
      validityType: 'lifetime',
      validityDays: null,
      validityEndsOn: null,
    });
    await call('PUT', `/admin/courses/${created.id}/subjects`, { subjects: [{ subjectId: subject.id }] });
    await call('PUT', `/admin/courses/${created.id}/links`, { examNodeIds: [post], instructorIds: [] });
    await call('PUT', `/admin/courses/${created.id}/publishing`, { status: 'published' });
  }

  // The student: signed up and onboarded already (those screens are covered by app.spec.ts).
  const registered = await request.post(`${E2E_WEB_ORIGIN}/api/v1/auth/register`, {
    data: {
      fullName: 'Kamala Rai',
      email,
      password,
      acceptTerms: true,
      device: { deviceId: `e2e-learning-${run}`, deviceName: 'E2E', platform: 'web' },
    },
  });
  expect(registered.ok(), await registered.text()).toBe(true);
  const student = ((await registered.json()) as { accessToken: string }).accessToken;
  await apiCall(request, student, 'PUT', '/me/target-posts', { examNodeIds: [post] });

  page = await browser.newPage();
  // Keep the run hermetic: the YouTube player itself is not loaded.
  await page.route(/youtube-nocookie\.com/, (route) => route.fulfill({ status: 204, body: '' }));
});
test.afterAll(async () => {
  await page.close();
});

const visible = <T extends ReturnType<Page['getByRole']>>(l: T) => l.filter({ visible: true });
const button = (name: string | RegExp) =>
  visible(page.getByRole('button', { name, exact: typeof name === 'string' }));
const link = (name: string | RegExp) => visible(page.getByRole('link', { name }));
const heading = (name: string | RegExp) => visible(page.getByRole('heading', { name }));
const text = (value: string | RegExp) => visible(page.getByText(value));

test('catalog for my exam, prices, and enrolling in a free course', async () => {
  await page.goto('/');
  await visible(page.getByLabel('Email', { exact: true })).fill(email);
  await visible(page.getByLabel('Password', { exact: true })).fill(password);
  await button('Log in').click();
  await expect(heading('Namaste, Kamala')).toBeVisible();
  await expect(heading('Courses for you')).toBeVisible();
  await expect(link('Constable Starter')).toBeVisible();
  await expect(link('Constable Complete')).toContainText('Rs 3,000');

  await link('Constable Complete').click();
  await expect(heading('Constable Complete')).toBeVisible();
  await expect(button('Buy')).toBeVisible();
  await expect(button('Enrol for free')).toHaveCount(0);
  // Free lessons to try before buying (D-074).
  await expect(heading('Try for free')).toBeVisible();
  await expect(link('Right to equality').first()).toBeVisible();
  await visible(page.getByRole('button', { name: 'Back' })).click();

  await link('Constable Starter').click();
  await expect(heading('Constable Starter')).toBeVisible();
  await expect(text('Notes: 1')).toBeVisible();
  await expect(text('Access with no end date')).toBeVisible();
  await button('Enrol for free').click();
  await expect(text('You have access to this course.')).toBeVisible();

  // The catalogue no longer offers a course the student has (Phase 16: it kept showing a price).
  await page.goto('/courses');
  // The first card is under "My courses" (progress); the catalogue's is the last one.
  await expect(link('Constable Starter').last()).toContainText('You have access');
  await expect(link('Constable Complete').last()).toContainText('Rs 3,000');
  await page.goto(`/course/constable-free-${run}`);
  await expect(heading('Constable Starter')).toBeVisible();
});

test('subject outline, a note marked finished, and the PDF in the self-hosted reader', async () => {
  await button('Start learning').click();
  await expect(heading('Constitution')).toBeVisible();
  await expect(text('0 of 3 done').first()).toBeVisible();

  await link('Right to equality').click();
  await expect(heading('Article 18')).toBeVisible();
  await expect(text('equal before the law')).toBeVisible();
  await expect(text('Equal protection of law')).toBeVisible();
  await button('Mark as finished').click();
  await expect(text('Finished')).toBeVisible();

  // Next lesson: the PDF, rendered by pdf.js inside the reader page.
  await button('Next lesson').click();
  await expect(heading('Rights summary PDF')).toBeVisible();
  const reader = page.frameLocator('iframe[title="PDF"]');
  await expect(reader.locator('.page canvas').first()).toBeVisible({ timeout: 20_000 });
  await expect(reader.locator('.page')).toHaveCount(3);
  await expect(text('Page 1 of 3')).toBeVisible();
  // Go to page (audit F-09).
  await button(/Go to page/).click();
  // Page 2, not the last: reaching the last page finishes the PDF, which later steps expect unfinished.
  await visible(page.getByLabel(/Page number/)).fill('2');
  await button('Go').click();
  await expect(text('Page 2 of 3')).toBeVisible();
  await expect(text('PDFs carry your email and account ID on every page.')).toBeVisible();

  await visible(page.getByRole('button', { name: 'Back' })).click();
  await expect(text('1 of 3 done').first()).toBeVisible();
  await expect(visible(page.getByRole('link', { name: 'Right to equality' }))).toContainText('Done');
});

test('video lessons use the signed / privacy-enhanced embed', async () => {
  await visible(page.getByRole('radio', { name: 'Videos' })).click();
  await link('Rights explained').click();
  await expect(heading('Rights explained')).toBeVisible();
  await expect(visible(page.locator('iframe[title="Rights explained"]'))).toHaveAttribute(
    'src',
    /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/,
  );
  // YouTube refuses to play without a Referer (player error 153); Bunny embeds keep sending none.
  await expect(visible(page.locator('iframe[title="Rights explained"]'))).toHaveAttribute(
    'referrerpolicy',
    'strict-origin-when-cross-origin',
  );
});

test('Home shows the current course with progress and continues the last unfinished lesson', async () => {
  await page.goto('/');
  await expect(heading('Namaste, Kamala')).toBeVisible();
  await expect(text('Current course')).toBeVisible();
  await expect(text('33% complete').first()).toBeVisible();
  // The PDF reported page 1 and is unfinished, so Continue reopens it.
  await button(/Continue: Rights summary PDF/).click();
  await expect(heading('Rights summary PDF')).toBeVisible();
});
