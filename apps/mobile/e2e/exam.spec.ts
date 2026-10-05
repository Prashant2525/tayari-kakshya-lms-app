import { expect, test, type Page } from '@playwright/test';
import { E2E_WEB_ORIGIN } from './constants.mjs';
import { apiCall, editorToken, publishedNode } from './helpers';

/**
 * §10 exam engine against the real API: rules → exam mode (answer, mark for review, reload and resume, palette,
 * confirm submit) → result with negative marking and partial credit → review; a weekly exam whose results wait for
 * the window to close; and a one-minute test the app submits by itself when time runs out.
 */
const run = Date.now().toString(36);
const password = 'exams every day';
const email = `exam.${run}@example.com`;
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
// Scoring choices are test inputs (D-044), not business defaults.
const scoring = {
  negativeMarking: true,
  multipleChoice: 'partial_if_no_wrong',
  match: 'per_pair',
  fillBlank: 'per_blank',
  scoreFloor: 'none',
};
const quizTitle = `Constitution quiz ${run}`;
const weeklyTitle = `Weekly exam ${run}`;
const quickTitle = `One-minute check ${run}`;
const writtenTitle = `Written test ${run}`;

let page: Page;
let staffToken = '';
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, request }) => {
  const token = await editorToken(request);
  staffToken = token;
  const call = <T = { id: string }>(method: 'POST' | 'PUT', p: string, data?: unknown) =>
    apiCall<T>(request, token, method, p, data);

  const authority = await publishedNode(request, token, {
    parentId: null,
    nodeType: 'authority',
    name: { en: 'Public Service Commission' },
    slug: `psc-${run}`,
  });
  const post = await publishedNode(request, token, {
    parentId: authority,
    nodeType: 'post',
    name: { en: 'Kharidar' },
    slug: `kharidar-${run}`,
  });
  const subject = await call('POST', '/admin/subjects', { name: { en: `Constitution ${run}` } });
  await call('PUT', `/admin/subjects/${subject.id}/status`, { status: 'published' });

  const question = async (content: Record<string, unknown>, marks: number, negative = 0) => {
    const q = await call('POST', '/admin/questions', {
      subjectId: subject.id,
      difficulty: 'easy',
      defaultMarks: marks,
      defaultNegativeMarks: negative,
      accessLevel: 'free',
      tags: [],
      content,
    });
    await call('PUT', `/admin/questions/${q.id}/status`, { status: 'published' });
    return q.id;
  };
  const single = await question(
    {
      type: 'single_choice',
      stem: doc('Which article guarantees equality?'),
      options: [
        { id: 'a', content: doc('Article 16') },
        { id: 'b', content: doc('Article 18') },
      ],
      correctOptionId: 'b',
      explanation: doc('Article 18 is the right to equality.'),
    },
    2,
    0.5,
  );
  const truth = await question(
    { type: 'true_false', stem: doc('Nepal has seven provinces.'), correct: true },
    1,
  );
  const multi = await question(
    {
      type: 'multiple_choice',
      stem: doc('Which are fundamental rights?'),
      options: [
        { id: 'a', content: doc('Equality') },
        { id: 'b', content: doc('Taxation') },
        { id: 'c', content: doc('Privacy') },
      ],
      correctOptionIds: ['a', 'c'],
    },
    2,
  );

  const course = await call('POST', '/admin/courses', {
    slug: `kharidar-free-${run}`,
    title: { en: `Kharidar Starter ${run}` },
    shortDescription: { en: 'Written exam preparation' },
  });
  await call('PUT', `/admin/courses/${course.id}/pricing`, {
    pricePaisa: 0,
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

  const assessment = async (body: Record<string, unknown>, questions: string[]) => {
    const a = await call('POST', '/admin/assessments', {
      accessLevel: 'free',
      availability: 'always',
      maxAttempts: null,
      passMarks: null,
      scoring,
      shuffleQuestions: false,
      shuffleOptions: false,
      resultRelease: 'immediate',
      showExplanations: true,
      leaderboardEnabled: false,
      subjectiveGrading: 'none',
      ...body,
    });
    await call('PUT', `/admin/assessments/${a.id}/structure`, {
      sections: [{ pickMode: 'fixed', questions: questions.map((questionId) => ({ questionId })) }],
    });
    await call('PUT', `/admin/assessments/${a.id}/publishing`, { status: 'published' });
  };
  await assessment(
    { type: 'quiz', title: { en: quizTitle }, subjectId: subject.id, durationMinutes: 20, passMarks: 1 },
    [single, truth, multi],
  );
  await assessment(
    {
      type: 'weekly',
      title: { en: weeklyTitle },
      examNodeId: post,
      availability: 'window',
      opensAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      closesAt: new Date(Date.now() + 120 * 60_000).toISOString(),
      durationMinutes: 60,
      resultRelease: 'after_close',
    },
    [truth],
  );
  await assessment({ type: 'quiz', title: { en: quickTitle }, subjectId: subject.id, durationMinutes: 1 }, [
    truth,
  ]);
  const written = await question(
    {
      type: 'subjective',
      stem: doc('Explain judicial review.'),
      modelAnswer: doc('Courts test laws against the constitution.'),
    },
    5,
  );
  await assessment(
    {
      type: 'subject_test',
      title: { en: writtenTitle },
      subjectId: subject.id,
      durationMinutes: null,
      subjectiveGrading: 'instructor',
    },
    [written],
  );

  const registered = await request.post(`${E2E_WEB_ORIGIN}/api/v1/auth/register`, {
    data: {
      fullName: 'Hari Sharma',
      email,
      password,
      acceptTerms: true,
      device: { deviceId: `e2e-exam-${run}`, deviceName: 'E2E', platform: 'web' },
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

async function openSubjectTests() {
  await link(`Kharidar Starter ${run}`).click();
  await link(`Constitution ${run}`).click();
  await visible(page.getByRole('radio', { name: 'Tests' })).click();
}

test('a quiz: rules, answers, mark for review, resume after a reload, submit, result and review', async () => {
  await page.goto('/');
  await visible(page.getByLabel('Email', { exact: true })).fill(email);
  await visible(page.getByLabel('Password', { exact: true })).fill(password);
  await button('Log in').click();
  await expect(heading('Namaste, Hari')).toBeVisible();

  await openSubjectTests();
  await link(quizTitle).click();
  await expect(heading(quizTitle)).toBeVisible();
  await expect(text('Yes — wrong answers lose marks')).toBeVisible();
  await expect(text('Right after you submit')).toBeVisible();
  await button('Start test').click();

  await expect(text('Question 1 of 3')).toBeVisible();
  await expect(visible(page.getByRole('timer'))).toBeVisible();
  await visible(page.getByRole('radio', { name: /Article 16/ })).click();
  await button('Next').click();
  await expect(text('Question 2 of 3')).toBeVisible();
  await visible(page.getByRole('radio', { name: 'True' })).click();
  await visible(page.getByRole('checkbox', { name: 'Mark for review' })).click();
  await button('Next').click();
  await visible(page.getByRole('checkbox', { name: /Equality/ })).click();
  await expect(text('All answers saved')).toBeVisible({ timeout: 15_000 });

  // A reload (or closing the app) resumes the same attempt with every answer.
  await page.reload();
  await expect(text(/Question \d of 3/)).toBeVisible();
  await button('All questions').click();
  const palette = visible(page.getByRole('dialog', { name: 'All questions' }));
  await expect(palette.getByRole('button', { name: 'Question 1, Answered' })).toBeVisible();
  await expect(palette.getByRole('button', { name: 'Question 2, Marked for review' })).toBeVisible();
  await expect(palette.getByRole('button', { name: 'Question 3, Answered' })).toBeVisible();
  await palette.getByRole('button', { name: 'Question 1, Answered' }).click();
  await expect(visible(page.getByRole('radio', { name: /Article 16/ }))).toHaveAttribute(
    'aria-checked',
    'true',
  );

  await button('All questions').click();
  await visible(page.getByRole('dialog', { name: 'All questions' }))
    .getByRole('button', { name: 'Submit' })
    .click();
  const confirm = visible(page.getByRole('dialog', { name: 'Submit your answers?' }));
  await expect(confirm.getByText('Answered 3 · Not answered 0 · Marked 1')).toBeVisible();
  await confirm.getByRole('button', { name: 'Submit' }).click();

  // −0.5 (wrong, negative marking) + 1 (true/false) + 1 (one of two correct options, part marks) = 1.5 of 5.
  await expect(text('Your score')).toBeVisible();
  await expect(visible(page.getByRole('progressbar', { name: '1.5 out of 5' }))).toBeVisible();
  await expect(text('Passed')).toBeVisible();
  await button('Review answers').click();
  await expect(heading('Answers')).toBeVisible();
  await expect(text('Article 18 is the right to equality.')).toBeVisible();
  await visible(page.getByRole('button', { name: 'Back' }))
    .first()
    .click();
  await button('Back to the test').click();
  await expect(visible(page.getByRole('link', { name: /Attempt 1: Score 1\.5\/5/ }))).toBeVisible();
});

test('a weekly exam for my exam waits for the window to close before showing results', async () => {
  await page.goto('/');
  await link('Tests for your exam').click();
  await link(weeklyTitle).click();
  await expect(text(/Your time ends when the test closes/)).toBeVisible();
  await button('Start test').click();
  await visible(page.getByRole('radio', { name: 'True' })).click();
  await button('Finish').click();
  await visible(page.getByRole('dialog', { name: 'Submit your answers?' }))
    .getByRole('button', { name: 'Submit' })
    .click();
  await expect(text('Your answers are submitted.')).toBeVisible();
  await expect(text(/Results will be published on/)).toBeVisible();
  await expect(text('Your score')).toHaveCount(0);
});

test('a written answer marked by a teacher shows the marks and the comment', async ({ request }) => {
  await page.goto('/');
  await openSubjectTests();
  await link(writtenTitle).click();
  await button('Start test').click();
  await visible(page.getByLabel('Your answer', { exact: true })).fill(
    'Courts can cancel unconstitutional laws.',
  );
  await button('Finish').click();
  await visible(page.getByRole('dialog', { name: 'Submit your answers?' }))
    .getByRole('button', { name: 'Submit' })
    .click();
  await expect(text('Your teachers will mark your written answers.')).toBeVisible();

  // A teacher marks it in the CMS (grading queue → grade).
  const queue = await apiCall<{ data: Array<{ attemptId: string; questionId: string }> }>(
    request,
    staffToken,
    'GET',
    '/admin/grading',
  );
  const item = queue.data[0]!;
  await apiCall(
    request,
    staffToken,
    'PUT',
    `/admin/attempts/${item.attemptId}/answers/${item.questionId}/grade`,
    {
      awarded: 4,
      comment: 'Good — also mention Article 133.',
    },
  );

  await page.reload();
  await expect(visible(page.getByRole('progressbar', { name: '4 out of 5' }))).toBeVisible();
  await button('Review answers').click();
  await expect(text('Comment from your teacher')).toBeVisible();
  await expect(text('Good — also mention Article 133.')).toBeVisible();
});

test('when time runs out the app submits the attempt by itself', async () => {
  test.setTimeout(150_000);
  await page.goto('/');
  await openSubjectTests();
  await link(quickTitle).click();
  await button('Start test').click();
  await visible(page.getByRole('radio', { name: 'True' })).click();
  await expect(text('Less than 5 minutes left')).toBeVisible();
  await expect(text('Submitted automatically when the time ran out.')).toBeVisible({ timeout: 100_000 });
  await expect(visible(page.getByRole('progressbar', { name: '1 out of 1' }))).toBeVisible();
});
