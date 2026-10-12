import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_EDITOR_EMAIL } from './e2e-env.mjs';

/**
 * §10 part 2 in the CMS: a student's written answer appears in Grading, is marked with a comment, the assessment's
 * results show the completed attempt, and results are released by hand — then the student sees score and comment.
 */
let page: Page;
let token = '';
let student = '';
let attemptId = '';
let assessmentId = '';
const run = Date.now().toString(36);
test.describe.configure({ mode: 'serial' });
const nav = (name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});

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
        : { Authorization: `Bearer ${student}` },
  });
  expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true);
  return (res.status() === 204 ? null : await res.json()) as T;
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_EDITOR_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(nav('Grading')).toBeVisible();
  token = (
    (await (
      await page.request.post('/api/v1/admin/auth/refresh', { headers: { 'X-TK-Client': 'admin' } })
    ).json()) as { accessToken: string }
  ).accessToken;

  const subject = await api('POST', '/admin/subjects', { name: { en: `Governance ${run}` } });
  await api('PUT', `/admin/subjects/${subject.id}/status`, { status: 'published' });
  const question = await api('POST', '/admin/questions', {
    subjectId: subject.id,
    difficulty: 'medium',
    defaultMarks: 5,
    accessLevel: 'free',
    content: {
      type: 'subjective',
      stem: doc('Explain judicial review.'),
      modelAnswer: doc('Courts test laws against the constitution.'),
    },
  });
  await api('PUT', `/admin/questions/${question.id}/status`, { status: 'published' });
  const assessment = await api('POST', '/admin/assessments', {
    type: 'subject_test',
    title: { en: `Governance test ${run}` },
    subjectId: subject.id,
    accessLevel: 'free',
    availability: 'always',
    durationMinutes: null,
    maxAttempts: null,
    passMarks: 3,
    // Test inputs, not business defaults (D-044).
    scoring: {
      negativeMarking: false,
      multipleChoice: 'all_or_nothing',
      match: 'all_or_nothing',
      fillBlank: 'all_or_nothing',
      scoreFloor: 'zero',
    },
    shuffleQuestions: false,
    shuffleOptions: false,
    resultRelease: 'manual',
    showExplanations: true,
    leaderboardEnabled: true,
    subjectiveGrading: 'instructor',
  });
  assessmentId = assessment.id;
  await api('PUT', `/admin/assessments/${assessmentId}/structure`, {
    sections: [{ pickMode: 'fixed', questions: [{ questionId: question.id }] }],
  });
  await api('PUT', `/admin/assessments/${assessmentId}/publishing`, { status: 'published' });

  // A student answers it (through the student API).
  const registered = await page.request.post('/api/v1/auth/register', {
    data: {
      fullName: 'Gita Karki',
      email: `gita.${run}@example.com`,
      password: 'grading every day',
      acceptTerms: true,
      device: { deviceId: `e2e-grading-${run}`, deviceName: 'E2E', platform: 'web' },
    },
  });
  student = ((await registered.json()) as { accessToken: string }).accessToken;
  attemptId = (await api('POST', `/assessments/${assessmentId}/attempts`, undefined, 'student')).id;
  await api(
    'PUT',
    `/attempts/${attemptId}/answers`,
    {
      answers: [
        {
          questionId: question.id,
          response: { type: 'subjective', text: 'Courts can cancel unconstitutional laws.' },
          markedForReview: false,
        },
      ],
    },
    'student',
  );
  await api('POST', `/attempts/${attemptId}/submit`, undefined, 'student');
});
test.afterAll(async () => {
  await page.close();
});

test('grade a written answer with a comment, then release the results', async () => {
  await nav('Grading').click();
  await expect(page.getByRole('heading', { name: 'Grading' })).toBeVisible();
  await expect(page.getByText('Courts can cancel unconstitutional laws.')).toBeVisible();
  await expect(page.getByText('Courts test laws against the constitution.')).toBeVisible();
  await expect(page.getByText('Gita Karki')).toBeVisible();

  await page.getByLabel('Marks (out of 5)').fill('6');
  await page.getByRole('button', { name: 'Save marks' }).click();
  await expect(page.getByText('Enter marks from 0 to 5')).toBeVisible();
  await page.getByLabel('Marks (out of 5)').fill('4');
  await page.getByLabel('Comment for the student').fill('Good — also mention Article 133.');
  await page.getByRole('button', { name: 'Save marks' }).click();
  await expect(page.getByText('Marks saved')).toBeVisible();
  await expect(page.getByText('Nothing to grade')).toBeVisible();

  await page.goto(`/assessments/${assessmentId}/results`);
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
  const row = page.getByRole('row', { name: /Gita Karki/ }).first();
  await expect(row.getByText('Completed')).toBeVisible();
  await expect(row.getByText('4 / 5')).toBeVisible();
  expect(
    (await api<{ released: boolean }>('GET', `/attempts/${attemptId}/result`, undefined, 'student')).released,
  ).toBe(false);

  await page.getByRole('button', { name: 'Release results' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Release results' }).click();
  await expect(page.getByText('Results released')).toBeVisible();
  await expect(page.getByText('Released', { exact: true })).toBeVisible();
  // Staff see the ranking with full names (audit F-03).
  await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
  await expect(page.getByText('1 student ranked by score, then time.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Gita Karki' }).last()).toBeVisible();

  const result = await api<{
    released: boolean;
    summary: { score: number; passed: boolean };
    questions: Array<{ graderComment: string | null }>;
  }>('GET', `/attempts/${attemptId}/result`, undefined, 'student');
  expect(result.released).toBe(true);
  expect(result.summary).toMatchObject({ score: 400, passed: true });
  expect(result.questions[0]?.graderComment).toBe('Good — also mention Article 133.');

  await row.getByRole('link', { name: 'Gita Karki' }).click();
  await expect(page.getByRole('heading', { name: /Gita Karki · attempt 1/ })).toBeVisible();
  await expect(page.getByText(/Marked by E2E Editor/)).toBeVisible();
});
