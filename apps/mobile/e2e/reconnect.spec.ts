import { expect, test, type Page } from '@playwright/test';
import { E2E_WEB_ORIGIN } from './constants.mjs';
import { apiCall, editorToken } from './helpers';

/**
 * §10 hardening against the real API: the connection drops during a test, the student answers anyway and closes the
 * app; reopened online, the answers kept on the phone are sent and count (exam autosave + offline copy).
 */
const run = Date.now().toString(36);
const password = 'keep my answers';
const email = `reconnect.${run}@example.com`;
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
let assessmentId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  const token = await editorToken(request);
  const call = <T = { id: string }>(method: 'POST' | 'PUT', p: string, data?: unknown) =>
    apiCall<T>(request, token, method, p, data);
  const subject = await call('POST', '/admin/subjects', { name: { en: `Offline ${run}` } });
  await call('PUT', `/admin/subjects/${subject.id}/status`, { status: 'published' });
  const ids: string[] = [];
  for (const stem of ['Sagarmatha is in Nepal.', 'Nepal has seven provinces.']) {
    const q = await call('POST', '/admin/questions', {
      subjectId: subject.id,
      difficulty: 'easy',
      defaultMarks: 1,
      accessLevel: 'free',
      tags: [],
      content: { type: 'true_false', stem: doc(stem), correct: true },
    });
    await call('PUT', `/admin/questions/${q.id}/status`, { status: 'published' });
    ids.push(q.id);
  }
  const a = await call('POST', '/admin/assessments', {
    type: 'subject_test',
    title: { en: `Connection test ${run}` },
    subjectId: subject.id,
    accessLevel: 'free',
    availability: 'always',
    durationMinutes: 20,
    maxAttempts: null,
    passMarks: null,
    // Test inputs (D-044), not business defaults.
    scoring: {
      negativeMarking: false,
      multipleChoice: 'all_or_nothing',
      match: 'all_or_nothing',
      fillBlank: 'all_or_nothing',
      scoreFloor: 'zero',
    },
    shuffleQuestions: false,
    shuffleOptions: false,
    resultRelease: 'immediate',
    showExplanations: true,
    leaderboardEnabled: false,
    subjectiveGrading: 'none',
  });
  assessmentId = a.id;
  await call('PUT', `/admin/assessments/${a.id}/structure`, {
    sections: [{ pickMode: 'fixed', questions: ids.map((questionId) => ({ questionId })) }],
  });
  await call('PUT', `/admin/assessments/${a.id}/publishing`, { status: 'published' });

  const registered = await request.post(`${E2E_WEB_ORIGIN}/api/v1/auth/register`, {
    data: {
      fullName: 'Kiran Rai',
      email,
      password,
      acceptTerms: true,
      device: { deviceId: `e2e-reconnect-${run}`, deviceName: 'E2E', platform: 'web' },
    },
  });
  expect(registered.ok(), await registered.text()).toBe(true);
});

const helpers = (page: Page) => {
  const visible = <T extends ReturnType<Page['getByRole']>>(l: T) => l.filter({ visible: true });
  return {
    visible,
    button: (name: string | RegExp) =>
      visible(page.getByRole('button', { name, exact: typeof name === 'string' })),
    text: (value: string | RegExp) => visible(page.getByText(value)),
  };
};

test('answers given offline are kept on the phone and count after reconnecting', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const { visible, button, text } = helpers(page);
  await page.goto('/');
  await visible(page.getByLabel('Email', { exact: true })).fill(email);
  await visible(page.getByLabel('Password', { exact: true })).fill(password);
  await button('Log in').click();
  await button('Skip').click();

  await page.goto(`/test/${assessmentId}`);
  await button('Start test').click();
  await expect(text('Question 1 of 2')).toBeVisible();
  await visible(page.getByRole('radio', { name: 'True' })).click();
  await expect(text('All answers saved')).toBeVisible({ timeout: 15_000 });

  // The connection drops: the second answer cannot be sent.
  await button('Next').click();
  await context.setOffline(true);
  await visible(page.getByRole('radio', { name: 'True' })).click();
  await expect(text('Offline — your answers are kept on this phone')).toBeVisible({ timeout: 15_000 });

  // The student closes the app; later it opens again with a connection.
  await page.close();
  await context.setOffline(false);
  const reopened = await context.newPage();
  const again = helpers(reopened);
  await reopened.goto(`/test/${assessmentId}`);
  await again.button('Continue test').click();
  await expect(again.text('All answers saved')).toBeVisible({ timeout: 15_000 });
  await again.button('All questions').click();
  const palette = again.visible(reopened.getByRole('dialog', { name: 'All questions' }));
  await expect(palette.getByRole('button', { name: 'Question 2, Answered' })).toBeVisible();
  await palette.getByRole('button', { name: 'Submit' }).click();
  await again
    .visible(reopened.getByRole('dialog', { name: 'Submit your answers?' }))
    .getByRole('button', { name: 'Submit' })
    .click();
  await expect(again.visible(reopened.getByRole('progressbar', { name: '2 out of 2' }))).toBeVisible();
  await context.close();
});
