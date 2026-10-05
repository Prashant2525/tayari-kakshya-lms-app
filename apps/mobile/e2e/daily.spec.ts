import { expect, test, type Page } from '@playwright/test';
import { E2E_WEB_ORIGIN } from './constants.mjs';
import { apiCall, editorToken } from './helpers';

/**
 * §10 part 3a against the real API: Home daily-challenge card → take today's challenge → rank on the result →
 * leaderboard → streak on Home; a past challenge taken as practice (no streak, no rank) (D-049).
 */
const run = Date.now().toString(36);
const password = 'challenge every day';
const email = `daily.${run}@example.com`;
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
/** The Nepal calendar day (UTC+5:45) as YYYY-MM-DD. */
const nepalDay = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 86_400_000 + 345 * 60_000).toISOString().slice(0, 10);
const todayTitle = `Today's challenge ${run}`;
const pastTitle = `Yesterday's challenge ${run}`;

let page: Page;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, request }) => {
  const token = await editorToken(request);
  const call = <T = { id: string }>(method: 'POST' | 'PUT', p: string, data?: unknown) =>
    apiCall<T>(request, token, method, p, data);
  const subject = await call('POST', '/admin/subjects', { name: { en: `Daily GK ${run}` } });
  await call('PUT', `/admin/subjects/${subject.id}/status`, { status: 'published' });
  const q = await call('POST', '/admin/questions', {
    subjectId: subject.id,
    difficulty: 'easy',
    defaultMarks: 1,
    accessLevel: 'free',
    tags: [],
    content: { type: 'true_false', stem: doc('Mount Everest is in Nepal.'), correct: true },
  });
  await call('PUT', `/admin/questions/${q.id}/status`, { status: 'published' });
  for (const [title, day] of [
    [todayTitle, nepalDay(0)],
    [pastTitle, nepalDay(-1)],
  ] as const) {
    const a = await call('POST', '/admin/assessments', {
      type: 'daily_challenge',
      title: { en: title },
      challengeDate: day,
      accessLevel: 'free',
      availability: 'always',
      durationMinutes: 5,
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
      leaderboardEnabled: true,
      subjectiveGrading: 'none',
    });
    await call('PUT', `/admin/assessments/${a.id}/structure`, {
      sections: [{ pickMode: 'fixed', questions: [{ questionId: q.id }] }],
    });
    await call('PUT', `/admin/assessments/${a.id}/publishing`, { status: 'published' });
  }

  const registered = await request.post(`${E2E_WEB_ORIGIN}/api/v1/auth/register`, {
    data: {
      fullName: 'Bina Gurung',
      email,
      password,
      acceptTerms: true,
      device: { deviceId: `e2e-daily-${run}`, deviceName: 'E2E', platform: 'web' },
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
const link = (name: string | RegExp) => visible(page.getByRole('link', { name }));
const text = (value: string | RegExp) => visible(page.getByText(value));

async function answerAndSubmit() {
  await button('Start test').click();
  await visible(page.getByRole('radio', { name: 'True' })).click();
  await button('Finish').click();
  await visible(page.getByRole('dialog', { name: 'Submit your answers?' }))
    .getByRole('button', { name: 'Submit' })
    .click();
}

test("today's challenge: streak, rank and leaderboard", async () => {
  await page.goto('/');
  await visible(page.getByLabel('Email', { exact: true })).fill(email);
  await visible(page.getByLabel('Password', { exact: true })).fill(password);
  await button('Log in').click();
  await button('Skip').click();

  await expect(text('Daily challenge')).toBeVisible();
  await expect(text('Start a streak today')).toBeVisible();
  await expect(text(todayTitle)).toBeVisible();
  await button('Start').click();
  await answerAndSubmit();

  await expect(text('Rank 1 of 1')).toBeVisible();
  await button('See leaderboard').click();
  await expect(text('Your rank: 1 of 1')).toBeVisible();
  await expect(text(/^You$/)).toBeVisible();

  await page.goto('/');
  await expect(text('1-day streak')).toBeVisible();
  await expect(text('Done for today · 1/1')).toBeVisible();
});

test('a past challenge is practice: no streak, no rank', async () => {
  await link('Past challenges').click();
  await expect(text('Practice only — they don’t count for your streak or ranking.')).toBeVisible();
  await link(pastTitle).click();
  await expect(text(/This challenge’s day has passed/)).toBeVisible();
  await answerAndSubmit();
  await expect(text('Practice — this does not count for your streak or ranking.')).toBeVisible();
  await expect(text(/^Rank /)).toHaveCount(0);

  await page.goto('/');
  await expect(text('1-day streak')).toBeVisible();
});
