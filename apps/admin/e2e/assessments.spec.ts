import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_EDITOR_EMAIL } from './e2e-env.mjs';

let page: Page;
let token = '';
test.describe.configure({ mode: 'serial' });
const nav = (name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});

/** API call as the signed-in editor (access token from the refresh cookie). */
async function apiCall(method: 'POST' | 'PUT', path: string, data: unknown) {
  const res = await page.request.fetch(`/api/v1${path}`, {
    method,
    data,
    headers: { Authorization: `Bearer ${token}`, 'X-TK-Client': 'admin' },
  });
  expect(res.ok(), `${method} ${path}`).toBe(true);
  return res.status() === 204 ? null : ((await res.json()) as { id: string });
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(E2E_EDITOR_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(nav('Assessments')).toBeVisible();
  const refresh = await page.request.post('/api/v1/admin/auth/refresh', {
    headers: { 'X-TK-Client': 'admin' },
  });
  token = ((await refresh.json()) as { accessToken: string }).accessToken;
  // Self-contained data: a subject with two published questions.
  const subject = await apiCall('POST', '/admin/subjects', { name: { en: 'Civics' } });
  for (const [text, marks] of [
    ['Nepal has seven provinces.', 1],
    ['The Constitution of Nepal was promulgated in 2072 BS.', 2],
  ] as const) {
    const q = await apiCall('POST', '/admin/questions', {
      subjectId: subject!.id,
      difficulty: 'easy',
      defaultMarks: marks,
      accessLevel: 'premium',
      content: { type: 'true_false', stem: doc(text), correct: true },
    });
    await apiCall('PUT', `/admin/questions/${q!.id}/status`, { status: 'published' });
  }
});
test.afterAll(async () => {
  await page.close();
});

test('quiz: scoring must be chosen, questions added from the bank, published only when ready', async () => {
  await nav('Assessments').click();
  await page.getByRole('button', { name: 'New assessment' }).click();
  await page.getByRole('menuitem', { name: 'Quiz', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New quiz' })).toBeVisible();

  await page.getByLabel('Title (English)').fill('Civics warm-up');
  await page.getByLabel('Subject', { exact: true }).selectOption({ label: 'Civics' });
  await page.getByLabel('Duration (minutes)').fill('10');
  // D-017 prefill: results right after submitting, explanations on; scoring is left for the team to choose (D-044).
  await expect(page.getByLabel('When students see results')).toHaveValue('immediate');
  await page.getByRole('button', { name: 'Create draft' }).click();
  const problems = page.getByRole('alert').filter({ hasText: 'Please fix these before saving' });
  await expect(problems).toContainText('Negative marking: Choose a value');
  await expect(problems).toContainText('Lowest total: Choose a value');

  await page.getByLabel('Negative marking').selectOption('false');
  await page.getByLabel('Lowest total').selectOption('zero');
  await page.getByLabel('Multiple-answer questions').selectOption('all_or_nothing');
  await page.getByLabel('Match the following').selectOption('per_pair');
  await page.getByLabel('Fill in the blank (several blanks)').selectOption('per_blank');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByText('Assessment created as a draft')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Civics warm-up' })).toBeVisible();
  await expect(page.getByText('Not ready yet')).toBeVisible();
  await expect(page.getByText('Add at least one section with questions')).toBeVisible();

  // Publishing is refused while not ready.
  await page.getByLabel('Assessment status').selectOption('published');
  await page.getByRole('button', { name: 'Update status' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'not ready to publish' })).toBeVisible();

  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByLabel('Section title').fill('Part A');
  await page.getByRole('button', { name: 'Add questions' }).click();
  const picker = page.getByRole('dialog', { name: 'Add questions' });
  await picker.getByLabel(/seven provinces/).check();
  await picker.getByLabel(/promulgated in 2072/).check();
  await picker.getByRole('button', { name: 'Add 2 questions' }).click();
  await page.getByLabel('Marks for question 1').fill('3');

  // A random section that asks for more questions than exist is reported, then removed.
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('region', { name: 'Section 2' }).getByLabel('Questions are').selectOption('random');
  await page.getByRole('region', { name: 'Section 2' }).getByLabel('Number of questions').fill('5');
  await page.getByRole('button', { name: 'Save questions' }).click();
  await expect(page.getByText('Questions saved')).toBeVisible();
  await expect(
    page.getByText('Section 2: Needs 5 questions but only 2 published questions match'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Remove section 2' }).click();
  await page.getByRole('button', { name: 'Save questions' }).click();
  await expect(page.getByText('Ready to publish')).toBeVisible();
  await expect(page.getByText('2 questions · 5 marks')).toBeVisible(); // 3 (override) + 2 (default)

  // Preview as student (D-075 / audit F-04): the questions in order with their marks, no answers.
  await page.getByRole('button', { name: 'Preview as student' }).click();
  const preview = page.getByRole('dialog', { name: 'Preview as student' });
  await expect(preview.getByRole('heading', { name: 'Civics warm-up' })).toBeVisible();
  await expect(preview).toContainText('10 minutes · 5 marks');
  await expect(preview.getByRole('article', { name: 'Question 1' })).toContainText(
    'Nepal has seven provinces.',
  );
  await expect(preview.getByRole('article', { name: 'Question 1' })).toContainText('3 marks');
  await expect(preview.getByRole('article', { name: 'Question 2' })).toContainText('True · False');
  await page.keyboard.press('Escape');

  await page.getByLabel('Assessment status').selectOption('published');
  await page.getByRole('button', { name: 'Update status' }).click();
  await expect(page.getByText('Status: Published')).toBeVisible();

  await nav('Assessments').click();
  const row = page.getByRole('row', { name: /Civics warm-up/ });
  await expect(row).toContainText('Quiz · Civics');
  await expect(row).toContainText('Always open');
  await expect(row).toContainText('Published');
  await expect(row.getByRole('cell').nth(1)).toHaveText('2');
});
