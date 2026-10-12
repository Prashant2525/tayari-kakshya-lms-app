import { expect, test, type Page } from '@playwright/test';
import { E2E_WEB_ORIGIN } from './constants.mjs';
import { pngFixture } from '@tk/e2e-support/png';
import { apiCall, codeFromEmail, editorToken, publishedNode } from './helpers';

/**
 * §9 part 2 against the real API: practice questions (check a free answer; a premium answer stays locked and is never
 * sent), report a question, bookmarks, unified search, edit profile and the account-deletion request. All content is
 * created through the CMS API first; the course is paid and the student has no access to it.
 */
const run = Date.now().toString(36);
const password = 'practice every day';
const email = `practice.${run}@example.com`;
const doc = (value: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] },
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
    name: { en: 'Nepal Army' },
    slug: `army-${run}`,
  });
  const post = await publishedNode(request, token, {
    parentId: authority,
    nodeType: 'post',
    name: { en: 'Sainya' },
    slug: `sainya-${run}`,
  });

  const subject = await call('POST', '/admin/subjects', { name: { en: `Civics ${run}` } });
  const chapter = await call('POST', `/admin/subjects/${subject.id}/chapters`, {
    numberLabel: '1',
    title: { en: 'Constitution' },
  });
  const topic = await call('POST', `/admin/chapters/${chapter.id}/topics`, {
    numberLabel: '1.1',
    title: { en: 'Equality' },
  });
  for (const [level, id] of [
    ['subjects', subject.id],
    ['chapters', chapter.id],
    ['topics', topic.id],
  ] as const) {
    await call('PUT', `/admin/${level}/${id}/status`, { status: 'published' });
  }
  const item = await call('POST', `/admin/topics/${topic.id}/items`, {
    type: 'note',
    title: { en: `Equality note ${run}` },
    accessLevel: 'free',
    noteContent: doc('Article 18 guarantees equality.'),
  });
  await call('PUT', `/admin/learning-items/${item.id}/publishing`, { status: 'published' });

  const questions = [
    {
      accessLevel: 'free',
      content: {
        type: 'single_choice',
        stem: doc(`Which article guarantees equality ${run}?`),
        options: [
          { id: 'a', content: doc('Article 16') },
          { id: 'b', content: doc('Article 18') },
        ],
        correctOptionId: 'b',
        explanation: doc('Article 18 is the right to equality.'),
      },
    },
    {
      accessLevel: 'premium',
      content: {
        type: 'subjective',
        stem: doc('Explain the right to constitutional remedy.'),
        modelAnswer: doc('SECRET MODEL ANSWER about Article 46'),
      },
    },
    {
      // A previous-year question (D-074).
      accessLevel: 'free',
      content: {
        type: 'true_false',
        stem: doc(`Sainya 2080 question ${run}: Nepal has seven provinces.`),
        correct: true,
      },
      sources: [{ examNodeId: post, yearBs: 2080 }],
    },
  ];
  for (const q of questions) {
    const created = await call('POST', '/admin/questions', {
      subjectId: subject.id,
      topicId: topic.id,
      difficulty: 'easy',
      defaultMarks: 2,
      tags: [],
      ...q,
    });
    await call('PUT', `/admin/questions/${created.id}/status`, { status: 'published' });
  }

  const course = await call('POST', '/admin/courses', {
    slug: `sainya-full-${run}`,
    title: { en: 'Sainya Complete' },
    shortDescription: { en: 'Written exam preparation' },
  });
  await call('PUT', `/admin/courses/${course.id}/pricing`, {
    pricePaisa: 250_000,
    salePricePaisa: null,
    saleStartsAt: null,
    saleEndsAt: null,
    validityType: 'lifetime',
    validityDays: null,
    validityEndsOn: null,
  });
  await call('PUT', `/admin/courses/${course.id}/subjects`, { subjects: [{ subjectId: subject.id }] });
  await call('PUT', `/admin/courses/${course.id}/links`, { examNodeIds: [post], instructorIds: [] });
  await call('PUT', `/admin/courses/${course.id}/publishing`, { status: 'published' });

  const registered = await request.post(`${E2E_WEB_ORIGIN}/api/v1/auth/register`, {
    data: {
      fullName: 'Bishnu Thapa',
      email,
      password,
      acceptTerms: true,
      device: { deviceId: `e2e-practice-${run}`, deviceName: 'E2E', platform: 'web' },
    },
  });
  expect(registered.ok(), await registered.text()).toBe(true);
  const student = ((await registered.json()) as { accessToken: string }).accessToken;
  await apiCall(request, student, 'PUT', '/me/target-posts', { examNodeIds: [post] });

  page = await browser.newPage();
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
const back = () =>
  visible(page.getByRole('button', { name: 'Back' }))
    .first()
    .click();

test('practice: check a free answer, and a premium answer stays locked', async () => {
  const answers: string[] = [];
  page.on('response', (res) => {
    if (res.url().includes('/questions')) void res.text().then((body) => answers.push(body));
  });

  await page.goto('/');
  await visible(page.getByLabel('Email', { exact: true })).fill(email);
  await visible(page.getByLabel('Password', { exact: true })).fill(password);
  await button('Log in').click();
  await expect(heading('Namaste, Bishnu')).toBeVisible();
  await link('Sainya Complete').click();
  await expect(heading('Sainya Complete')).toBeVisible();
  await link(`Civics ${run}`).click();
  await visible(page.getByRole('radio', { name: 'Questions' })).click();

  await expect(text(`Which article guarantees equality ${run}?`)).toBeVisible();
  // The card of this question (the subject also has a previous-year question with its own button).
  const card = visible(page.locator('div'))
    .filter({ has: page.getByText(`Which article guarantees equality ${run}?`) })
    .filter({ has: page.getByRole('button', { name: 'Check answer' }) })
    .last();
  await visible(page.getByRole('radio', { name: /Article 16/ })).click();
  await card.getByRole('button', { name: 'Check answer' }).click();
  await expect(visible(page.getByRole('alert'))).toContainText('Not correct');
  await expect(text('Article 18 is the right to equality.')).toBeVisible();
  await button('Try again').click();
  await visible(page.getByRole('radio', { name: /Article 18/ })).click();
  await card.getByRole('button', { name: 'Check answer' }).click();
  await expect(visible(page.getByRole('status'))).toHaveText('Correct');

  await expect(text('Explain the right to constitutional remedy.')).toBeVisible();
  await expect(text('Answer is Premium')).toBeVisible();
  // Rule 5: the locked model answer never reaches the app.
  expect(answers.length).toBeGreaterThan(0);
  expect(answers.join('\n')).not.toContain('SECRET MODEL ANSWER');
  await expect(page.getByText('SECRET MODEL ANSWER')).toHaveCount(0);
});

test('report a question and save it for later', async () => {
  await button('Report a problem').first().click();
  const dialog = visible(page.getByRole('dialog', { name: 'Report a problem' }));
  await dialog.getByRole('radio', { name: 'Spelling or typing mistake' }).click();
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog.getByText('Thank you. Our team will check it.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  await button('Save for later').first().click();
  await expect(button('Remove from saved').first()).toBeVisible();
});

test('search finds lessons and questions; Saved lists the bookmark', async () => {
  await page.goto('/');
  await button('Search courses, lessons, questions').click();
  await visible(page.getByLabel('Search', { exact: true })).fill(run);
  await expect(link(`Equality note ${run}`)).toBeVisible();
  await expect(link(new RegExp(`Which article guarantees equality ${run}`))).toBeVisible();
  await link(new RegExp(`Which article guarantees equality ${run}`)).click();
  await expect(text(`Which article guarantees equality ${run}?`)).toBeVisible();
  await expect(button('Remove from saved')).toBeVisible();

  await page.goto('/profile');
  await link('Saved lessons and questions').click();
  await expect(heading('Saved')).toBeVisible();
  await expect(link(new RegExp(`Which article guarantees equality ${run}`))).toBeVisible();
});

test('previous-year questions by exam and year (D-074)', async () => {
  await page.goto('/');
  await link('Previous-year questions').click();
  await expect(heading('Previous-year questions')).toBeVisible();
  await button(/^Exam:/).click();
  await visible(page.getByRole('dialog', { name: 'Exam' }).getByRole('option', { name: 'Sainya' })).click();
  await button(/^Year \(BS\):/).click();
  await visible(
    page.getByRole('dialog', { name: 'Year (BS)' }).getByRole('option', { name: '2080' }),
  ).click();
  await expect(text(`Sainya 2080 question ${run}: Nepal has seven provinces.`)).toBeVisible();
  await expect(text(`Which article guarantees equality ${run}?`)).toHaveCount(0);
});

test('edit profile, photo and email (D-074), then request and cancel account deletion', async ({
  request,
}) => {
  await page.goto('/profile');
  await link('Edit profile').click();
  await expect(heading('Edit profile')).toBeVisible();
  const name = visible(page.getByLabel('Full name', { exact: true }));
  await expect(name).toHaveValue('Bishnu Thapa');
  await name.fill('Bishnu Kumari Thapa');
  await button(/^Gender:/).click();
  await visible(page.getByRole('dialog', { name: 'Gender' }))
    .getByText('Female')
    .click();
  await button('Save').click();
  await expect(text('Your profile is saved.')).toBeVisible();

  // Profile photo: picked from the device, stored by the API as a 512 px square.
  const chooser = page.waitForEvent('filechooser');
  await button('Add photo').click();
  await (await chooser).setFiles({ name: 'me.png', mimeType: 'image/png', buffer: pngFixture(600, 400) });
  await expect(button('Remove photo')).toBeVisible();
  await expect(page.locator('img[src*="/avatars/"]').first()).toBeAttached();

  // Email: a code goes to the new address; the account switches once it is entered.
  const newEmail = `practice.new.${run}@example.com`;
  await link('Change: Email').click();
  await expect(heading('Change email')).toBeVisible();
  await visible(page.getByLabel('New email', { exact: true })).fill(newEmail);
  await visible(page.getByLabel('Current password', { exact: true })).fill(password);
  const sentAt = new Date();
  await button('Send code').click();
  await expect(text(`We sent a code to ${newEmail}`)).toBeVisible();
  await visible(page.getByLabel('6-digit code', { exact: true })).fill(
    await codeFromEmail(request, newEmail, sentAt),
  );
  await expect(text(`Your email is now ${newEmail}. Sign in with it from now on.`)).toBeVisible();
  await back();
  await expect(text(newEmail)).toBeVisible();
  await back();
  await expect(text('Bishnu Kumari Thapa')).toBeVisible();
  await expect(text(newEmail)).toBeVisible();

  await button('Delete account').click();
  await expect(text('Delete your account?')).toBeVisible();
  await button('Yes, delete my account').click();
  await expect(text(/Your account will be deleted on/)).toBeVisible();
  await button('Keep my account').click();
  await expect(button('Delete account')).toBeVisible();
});
