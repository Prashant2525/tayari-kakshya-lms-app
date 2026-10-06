import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountDeletionService } from '../src/modules/auth/account-deletion.service.js';
import { publisher, seedPublishedCourse } from './content-helpers.js';
import { call, createTestApp, registerStudent, setSetting, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
});

const DAY = 86_400_000;
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
const opt = (id: string, text: string) => ({ id, content: doc(text) });
// Scoring choices are test inputs (D-044), not business defaults.
const scoring = {
  negativeMarking: false,
  multipleChoice: 'all_or_nothing',
  match: 'all_or_nothing',
  fillBlank: 'all_or_nothing',
  scoreFloor: 'zero',
};

async function setup() {
  const admin = await publisher(ctx);
  const seeded = await seedPublishedCourse(ctx, admin);
  const question = async (content: Record<string, unknown>, accessLevel: 'free' | 'premium' = 'free') => {
    const q = await call(ctx, 'POST', '/admin/questions', {
      token: admin,
      body: {
        subjectId: seeded.subject.id,
        difficulty: 'easy',
        defaultMarks: 1,
        accessLevel,
        tags: [],
        content,
      },
    });
    if (q.status !== 201) throw new Error(JSON.stringify(q.body));
    await call(ctx, 'PUT', `/admin/questions/${q.body.id}/status`, {
      token: admin,
      body: { status: 'published' },
    });
    return q.body.id as string;
  };
  const single = (accessLevel: 'free' | 'premium' = 'free') =>
    question(
      {
        type: 'single_choice',
        stem: doc('Capital of Nepal?'),
        options: [opt('a', 'Pokhara'), opt('b', 'Kathmandu')],
        correctOptionId: 'b',
      },
      accessLevel,
    );
  const multi = () =>
    question({
      type: 'multiple_choice',
      stem: doc('Which are rivers?'),
      options: [opt('a', 'Koshi'), opt('b', 'Everest'), opt('c', 'Gandaki')],
      correctOptionIds: ['a', 'c'],
    });
  const written = () =>
    question({ type: 'subjective', stem: doc('Explain federalism.'), modelAnswer: doc('Power is shared.') });
  const student = async (email = 'asha@example.com') => {
    const token = (await registerStudent(ctx, email)).accessToken;
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    return { token, id: user.id };
  };
  const check = (token: string, id: string, response: unknown) =>
    call(ctx, 'POST', `/practice-questions/${id}/check`, { token, body: { response } });
  const notebook = (token: string, query = '') => call(ctx, 'GET', `/me/mistakes${query}`, { token });
  const review = (token: string, id: string, body: unknown) =>
    call(ctx, 'POST', `/me/mistakes/${id}/review`, { token, body });
  const test = async (questionIds: string[], overrides: Record<string, unknown> = {}) => {
    const created = await call(ctx, 'POST', '/admin/assessments', {
      token: admin,
      body: {
        type: 'quiz',
        title: { en: 'Quiz' },
        accessLevel: 'free',
        availability: 'always',
        durationMinutes: 10,
        maxAttempts: null,
        passMarks: null,
        scoring,
        shuffleQuestions: false,
        shuffleOptions: false,
        resultRelease: 'immediate',
        showExplanations: true,
        leaderboardEnabled: false,
        subjectiveGrading: 'none',
        ...overrides,
      },
    });
    if (created.status !== 201) throw new Error(JSON.stringify(created.body));
    const id = created.body.id as string;
    await call(ctx, 'PUT', `/admin/assessments/${id}/structure`, {
      token: admin,
      body: {
        sections: [{ pickMode: 'fixed', questions: questionIds.map((questionId) => ({ questionId })) }],
      },
    });
    const published = await call(ctx, 'PUT', `/admin/assessments/${id}/publishing`, {
      token: admin,
      body: { status: 'published' },
    });
    if (published.status >= 300) throw new Error(JSON.stringify(published.body));
    return id;
  };
  const take = async (
    token: string,
    id: string,
    answers: Array<{ questionId: string; response: unknown }>,
  ) => {
    const started = await call(ctx, 'POST', `/assessments/${id}/attempts`, { token });
    if (started.status !== 200) throw new Error(JSON.stringify(started.body));
    await call(ctx, 'PUT', `/attempts/${started.body.id}/answers`, {
      token,
      body: { answers: answers.map((a) => ({ ...a, markedForReview: false })) },
    });
    const submitted = await call(ctx, 'POST', `/attempts/${started.body.id}/submit`, { token });
    if (submitted.status !== 200) throw new Error(JSON.stringify(submitted.body));
    return started.body.id as string;
  };
  return { admin, seeded, single, multi, written, student, check, notebook, review, test, take };
}

describe('practice answers and the mistake notebook (D-050)', () => {
  it('scores practice answers on the server and keeps wrong or partly correct ones', async () => {
    const s = await setup();
    const [capital, rivers, essay] = [await s.single(), await s.multi(), await s.written()];
    const asha = await s.student();

    let res = await s.check(asha.token, capital, { type: 'single_choice', optionId: 'a' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ outcome: 'wrong', addedToNotebook: true });
    res = await s.check(asha.token, rivers, { type: 'multiple_choice', optionIds: ['a'] });
    expect(res.body).toEqual({ outcome: 'partial', addedToNotebook: true });
    // Correct and unanswered are not mistakes.
    expect(
      (await s.check(asha.token, rivers, { type: 'multiple_choice', optionIds: ['c', 'a'] })).body,
    ).toEqual({
      outcome: 'correct',
      addedToNotebook: false,
    });
    const fresh = await s.single();
    expect((await s.check(asha.token, fresh, { type: 'single_choice', optionId: null })).body.outcome).toBe(
      'skipped',
    );
    // Written answers are self-reviewed; a response of another type is refused.
    expect((await s.check(asha.token, essay, { type: 'subjective', text: 'x' })).status).toBe(400);
    expect((await s.check(asha.token, capital, { type: 'true_false', value: true })).status).toBe(400);

    const list = await s.notebook(asha.token);
    expect(list.status).toBe(200);
    expect(list.body.required).toBe(2);
    expect(list.body.data.map((m: { questionId: string }) => m.questionId).sort()).toEqual(
      [capital, rivers].sort(),
    );
    const entry = list.body.data.find((m: { questionId: string }) => m.questionId === capital);
    expect(entry).toMatchObject({
      timesWrong: 1,
      correctStreak: 0,
      lastSource: 'practice',
      subject: { id: s.seeded.subject.id },
    });
    expect(entry.question.answer).toMatchObject({ type: 'single_choice', correctOptionId: 'b' });
    expect((await call(ctx, 'GET', '/me/mistakes/summary', { token: asha.token })).body).toEqual({
      active: 2,
      mastered: 0,
      required: 2,
      subjects: [{ id: s.seeded.subject.id, name: { en: 'English', ne: 'अंग्रेजी' }, count: 2 }],
    });
  });

  it('revision: N correct answers in a row master a question; a wrong one resets the run; removing it', async () => {
    const s = await setup();
    const capital = await s.single();
    const rivers = await s.multi();
    const asha = await s.student();
    await s.check(asha.token, capital, { type: 'single_choice', optionId: 'a' });
    await s.check(asha.token, rivers, { type: 'multiple_choice', optionIds: ['b'] });

    const right = { response: { type: 'single_choice', optionId: 'b' } };
    let r = await s.review(asha.token, capital, right);
    expect(r.body).toEqual({ outcome: 'correct', correctStreak: 1, required: 2, mastered: false });
    r = await s.review(asha.token, capital, { response: { type: 'single_choice', optionId: 'a' } });
    expect(r.body).toEqual({ outcome: 'wrong', correctStreak: 0, required: 2, mastered: false });
    await s.review(asha.token, capital, right);
    r = await s.review(asha.token, capital, right);
    expect(r.body).toEqual({ outcome: 'correct', correctStreak: 2, required: 2, mastered: true });
    // Mastered: gone from the notebook, counted as mastered; it cannot be reviewed any more.
    expect((await s.notebook(asha.token)).body.data.map((m: { questionId: string }) => m.questionId)).toEqual(
      [rivers],
    );
    expect((await call(ctx, 'GET', '/me/mistakes/summary', { token: asha.token })).body).toMatchObject({
      active: 1,
      mastered: 1,
    });
    expect((await s.review(asha.token, capital, right)).status).toBe(404);
    // Partly correct in revision is not correct; an empty answer is refused.
    r = await s.review(asha.token, rivers, { response: { type: 'multiple_choice', optionIds: ['a'] } });
    expect(r.body).toMatchObject({ outcome: 'partial', correctStreak: 0 });
    expect(
      (await s.review(asha.token, rivers, { response: { type: 'multiple_choice', optionIds: [] } })).status,
    ).toBe(400);
    expect((await s.review(asha.token, rivers, { selfCorrect: true })).status).toBe(400);

    // The CMS setting decides N.
    await setSetting(ctx, 'mistakes.revision', { correctInARow: 1 });
    r = await s.review(asha.token, rivers, { response: { type: 'multiple_choice', optionIds: ['a', 'c'] } });
    expect(r.body).toMatchObject({ mastered: true, required: 1 });

    // A new mistake brings a mastered question back, with its history; removing takes it out again.
    await s.check(asha.token, capital, { type: 'single_choice', optionId: 'a' });
    const back = (await s.notebook(asha.token)).body.data;
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ questionId: capital, timesWrong: 3, correctStreak: 0 });
    expect((await call(ctx, 'DELETE', `/me/mistakes/${capital}`, { token: asha.token })).status).toBe(204);
    expect((await call(ctx, 'DELETE', `/me/mistakes/${capital}`, { token: asha.token })).status).toBe(404);
    expect((await s.notebook(asha.token)).body.data).toEqual([]);

    // Another student's notebook is separate; questions never answered are not in it.
    const bina = await s.student('bina@example.com');
    expect((await s.notebook(bina.token)).body.data).toEqual([]);
    expect(
      (await s.review(bina.token, rivers, { response: { type: 'multiple_choice', optionIds: ['a'] } }))
        .status,
    ).toBe(404);
  });

  it('adds test mistakes only once results are released, never skipped answers', async () => {
    const s = await setup();
    const capital = await s.single();
    const rivers = await s.multi();
    const other = await s.single();
    const asha = await s.student();
    const manual = await s.test([capital, rivers, other], { resultRelease: 'manual' });
    await s.take(asha.token, manual, [
      { questionId: capital, response: { type: 'single_choice', optionId: 'a' } },
      { questionId: rivers, response: { type: 'multiple_choice', optionIds: ['a'] } },
      // `other` left unanswered.
    ]);
    // Results not released: the notebook must not reveal which answers were wrong.
    expect((await s.notebook(asha.token)).body.data).toEqual([]);
    expect((await call(ctx, 'GET', '/me/mistakes/summary', { token: asha.token })).body.active).toBe(0);

    await call(ctx, 'POST', `/admin/assessments/${manual}/release-results`, { token: s.admin });
    let list = (await s.notebook(asha.token)).body.data;
    // Partly correct counts (all-or-nothing marks it wrong here); the unanswered question does not.
    expect(list.map((m: { questionId: string }) => m.questionId).sort()).toEqual([capital, rivers].sort());
    expect(list[0]).toMatchObject({ lastSource: 'test', timesWrong: 1 });
    // Reading again does not add them twice.
    list = (await s.notebook(asha.token)).body.data;
    expect(list.every((m: { timesWrong: number }) => m.timesWrong === 1)).toBe(true);

    // A second test with the same question adds to its history.
    const quiz = await s.test([capital]);
    await s.take(asha.token, quiz, [
      { questionId: capital, response: { type: 'single_choice', optionId: 'a' } },
    ]);
    list = (await s.notebook(asha.token)).body.data;
    expect(list.find((m: { questionId: string }) => m.questionId === capital).timesWrong).toBe(2);
  });

  it('locks premium answers without access, unless the solution was already shown in a released test', async () => {
    const s = await setup();
    const premium = await s.single('premium');
    const asha = await s.student();
    expect((await s.check(asha.token, premium, { type: 'single_choice', optionId: 'a' })).status).toBe(403);

    // A free test without solutions: the mistake is listed but its answer stays locked.
    const hidden = await s.test([premium], { showExplanations: false });
    await s.take(asha.token, hidden, [
      { questionId: premium, response: { type: 'single_choice', optionId: 'a' } },
    ]);
    let [entry] = (await s.notebook(asha.token)).body.data;
    expect(entry.question).toMatchObject({ locked: true, answer: null });
    expect(
      (await s.review(asha.token, premium, { response: { type: 'single_choice', optionId: 'b' } })).status,
    ).toBe(403);

    // The same question in a test that showed solutions: the student saw the answer, so revision is open.
    const shown = await s.test([premium]);
    await s.take(asha.token, shown, [
      { questionId: premium, response: { type: 'single_choice', optionId: 'a' } },
    ]);
    [entry] = (await s.notebook(asha.token)).body.data;
    expect(entry.question.answer).toMatchObject({ correctOptionId: 'b' });
    expect(
      (await s.review(asha.token, premium, { response: { type: 'single_choice', optionId: 'b' } })).status,
    ).toBe(200);
  });

  it('self-reviews written answers, needs sign-in and is erased with the account', async () => {
    const s = await setup();
    const essay = await s.written();
    const asha = await s.student();
    const selfTest = await s.test([essay], { subjectiveGrading: 'self' });
    const attemptId = await s.take(asha.token, selfTest, [
      { questionId: essay, response: { type: 'subjective', text: 'Not sure.' } },
    ]);
    // Awaiting self-marks: not completed yet, so not in the notebook.
    expect((await s.notebook(asha.token)).body.data).toEqual([]);
    await call(ctx, 'POST', `/attempts/${attemptId}/self-grade`, {
      token: asha.token,
      body: { grades: [{ questionId: essay, awarded: 0 }] },
    });
    expect((await s.notebook(asha.token)).body.data.map((m: { questionId: string }) => m.questionId)).toEqual(
      [essay],
    );
    expect((await s.review(asha.token, essay, { response: { type: 'subjective', text: 'x' } })).status).toBe(
      400,
    );
    const r = await s.review(asha.token, essay, { selfCorrect: true });
    expect(r.body).toMatchObject({ outcome: 'correct', correctStreak: 1 });

    expect((await call(ctx, 'GET', '/me/mistakes')).status).toBe(401);
    expect((await call(ctx, 'GET', '/me/mistakes?cursor=nonsense', { token: asha.token })).status).toBe(400);

    await call(ctx, 'POST', '/me/deletion', { token: asha.token });
    await ctx.app.get(AccountDeletionService).processDue(new Date(Date.now() + 60 * DAY));
    expect(await ctx.prisma.mistake.count()).toBe(0);
  });
});
