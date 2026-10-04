import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AttemptsService } from '../src/modules/attempts/attempts.service.js';
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

const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
// Scoring choices are arbitrary test inputs, not business defaults (D-044).
const scoring = {
  negativeMarking: true,
  multipleChoice: 'partial_if_no_wrong',
  match: 'per_pair',
  fillBlank: 'per_blank',
  scoreFloor: 'none',
};
const MIN = 60_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

async function setup() {
  const admin = await publisher(ctx);
  const seeded = await seedPublishedCourse(ctx, admin);
  const question = async (
    content: Record<string, unknown>,
    opts: { marks?: number; negative?: number; tags?: string[] } = {},
  ) => {
    const res = await call(ctx, 'POST', '/admin/questions', {
      token: admin,
      body: {
        subjectId: seeded.subject.id,
        topicId: seeded.topic.id,
        difficulty: 'easy',
        defaultMarks: opts.marks ?? 1,
        defaultNegativeMarks: opts.negative ?? 0,
        accessLevel: 'premium',
        tags: opts.tags ?? [],
        content,
      },
    });
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    await call(ctx, 'PUT', `/admin/questions/${res.body.id}/status`, {
      token: admin,
      body: { status: 'published' },
    });
    return res.body.id as string;
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
      explanation: doc('EXPLANATION: Article 18 is the right to equality.'),
    },
    { marks: 2, negative: 0.5 },
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
    { marks: 2 },
  );
  const truth = await question({
    type: 'true_false',
    stem: doc('Nepal has seven provinces.'),
    correct: true,
  });
  const written = await question(
    {
      type: 'subjective',
      stem: doc('Explain constitutional remedy.'),
      modelAnswer: doc('MODEL ANSWER about Article 46'),
    },
    { marks: 5 },
  );
  const pool = [];
  for (let i = 0; i < 3; i++) {
    pool.push(
      await question(
        { type: 'true_false', stem: doc(`Pool statement ${i}`), correct: true },
        { tags: ['pool'] },
      ),
    );
  }

  const assessment = async (overrides: Record<string, unknown>, sections: unknown[]) => {
    const created = await call(ctx, 'POST', '/admin/assessments', {
      token: admin,
      body: {
        type: 'quiz',
        title: { en: 'Constitution quiz' },
        subjectId: seeded.subject.id,
        accessLevel: 'free',
        availability: 'always',
        durationMinutes: 20,
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
    const s = await call(ctx, 'PUT', `/admin/assessments/${id}/structure`, {
      token: admin,
      body: { sections },
    });
    if (s.status !== 200) throw new Error(JSON.stringify(s.body));
    const p = await call(ctx, 'PUT', `/admin/assessments/${id}/publishing`, {
      token: admin,
      body: { status: 'published' },
    });
    if (p.status !== 204 && p.status !== 200) throw new Error(JSON.stringify(p.body));
    return id;
  };
  const fixed = (...ids: string[]) => ({
    pickMode: 'fixed',
    questions: ids.map((questionId) => ({ questionId })),
  });

  const tokens = await registerStudent(ctx, 'student@example.com');
  const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'student@example.com' } });
  const grant = (courseId = seeded.course.id) =>
    call(ctx, 'POST', `/admin/users/${user.id}/entitlements`, {
      token: admin,
      body: { courseId, endsAt: null },
    });
  return {
    admin,
    seeded,
    student: tokens.accessToken,
    userId: user.id,
    grant,
    assessment,
    fixed,
    single,
    multi,
    truth,
    written,
    pool,
  };
}

type Setup = Awaited<ReturnType<typeof setup>>;
const start = (s: Setup, id: string, token = s.student) =>
  call(ctx, 'POST', `/assessments/${id}/attempts`, { token });
const save = (s: Setup, attemptId: string, answers: unknown[]) =>
  call(ctx, 'PUT', `/attempts/${attemptId}/answers`, { token: s.student, body: { answers } });
const submit = (s: Setup, attemptId: string) =>
  call(ctx, 'POST', `/attempts/${attemptId}/submit`, { token: s.student });

describe('taking an assessment', () => {
  it('starts, autosaves, resumes and submits; scores with negative marking; no answers before the result', async () => {
    const s = await setup();
    const id = await s.assessment({}, [s.fixed(s.single, s.multi, s.truth)]);

    const listed = await call(
      ctx,
      'GET',
      `/assessments?courseId=${s.seeded.course.id}&subjectId=${s.seeded.subject.id}`,
      {
        token: s.student,
      },
    );
    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual([
      expect.objectContaining({
        id,
        locked: false,
        state: 'open',
        questionCount: 3,
        totalMarks: 500,
        attemptsUsed: 0,
      }),
    ]);

    const started = await start(s, id);
    expect(started.status).toBe(200);
    const attempt = started.body;
    expect(attempt.sections[0].questions.map((q: { questionId: string }) => q.questionId)).toEqual([
      s.single,
      s.multi,
      s.truth,
    ]);
    expect(Date.parse(attempt.deadlineAt) - Date.parse(attempt.startedAt)).toBe(20 * MIN);
    // Rule 5: nothing of the answer key while the attempt runs.
    for (const secret of ['correctOptionId', 'correctOptionIds', '"correct"', 'EXPLANATION']) {
      expect(JSON.stringify(attempt)).not.toContain(secret);
    }
    expect((await start(s, id)).body.id).toBe(attempt.id);

    const saved = await save(s, attempt.id, [
      { questionId: s.single, response: { type: 'single_choice', optionId: 'a' }, markedForReview: false },
      {
        questionId: s.multi,
        response: { type: 'multiple_choice', optionIds: ['a'] },
        markedForReview: false,
      },
      { questionId: s.truth, response: null, markedForReview: true },
    ]);
    expect(saved.status).toBe(200);
    // The newest save wins.
    await save(s, attempt.id, [
      {
        questionId: s.multi,
        response: { type: 'multiple_choice', optionIds: ['a', 'c'] },
        markedForReview: false,
      },
    ]);
    const resumed = await call(ctx, 'GET', `/attempts/${attempt.id}`, { token: s.student });
    const byId = Object.fromEntries(
      resumed.body.sections[0].questions.map((q: { questionId: string }) => [q.questionId, q]),
    );
    expect(byId[s.single].response).toEqual({ type: 'single_choice', optionId: 'a' });
    expect(byId[s.multi].response).toEqual({ type: 'multiple_choice', optionIds: ['a', 'c'] });
    expect(byId[s.truth]).toMatchObject({ response: null, markedForReview: true });

    // Wrong type and unknown questions are refused.
    expect(
      (
        await save(s, attempt.id, [
          { questionId: s.single, response: { type: 'true_false', value: true }, markedForReview: false },
        ])
      ).status,
    ).toBe(400);
    expect(
      (await save(s, attempt.id, [{ questionId: s.written, response: null, markedForReview: false }])).status,
    ).toBe(400);

    const result = await submit(s, attempt.id);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      status: 'completed',
      released: true,
      counted: true,
      autoSubmitted: false,
      summary: {
        score: 150,
        maxScore: 500,
        correct: 1,
        wrong: 1,
        skipped: 1,
        partial: 0,
        pending: 0,
        passed: null,
      },
    });
    const single = result.body.questions.find((q: { questionId: string }) => q.questionId === s.single);
    expect(single).toMatchObject({ outcome: 'wrong', awarded: -50, answer: { correctOptionId: 'b' } });
    expect(JSON.stringify(single)).toContain('EXPLANATION');

    // Submitting again is harmless; answers can no longer change.
    expect((await submit(s, attempt.id)).body.summary.score).toBe(150);
    const late = await save(s, attempt.id, [
      { questionId: s.truth, response: { type: 'true_false', value: true }, markedForReview: false },
    ]);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('ATTEMPT_CLOSED');

    const history = await call(ctx, 'GET', '/me/attempts', { token: s.student });
    expect(history.body.data).toEqual([
      expect.objectContaining({
        id: attempt.id,
        score: 150,
        released: true,
        assessment: expect.objectContaining({ id }),
      }),
    ]);
  });

  it('creates one attempt when several starts arrive together', async () => {
    const s = await setup();
    const id = await s.assessment({}, [s.fixed(s.single, s.truth)]);
    const results = await Promise.all(Array.from({ length: 5 }, () => start(s, id)));
    expect(new Set(results.map((r) => r.status))).toEqual(new Set([200]));
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await ctx.prisma.attempt.count()).toBe(1);
  });

  it('accepts saves within the grace period, then submits automatically when time is up', async () => {
    const s = await setup();
    const id = await s.assessment({}, [s.fixed(s.single, s.truth)]);
    const attempt = (await start(s, id)).body;
    const deadline = (ms: number) =>
      ctx.prisma.attempt.update({
        where: { id: attempt.id },
        data: { startedAt: new Date(Date.now() - 30 * MIN), deadlineAt: new Date(Date.now() + ms) },
      });

    await deadline(-10_000); // inside the default 30-second grace
    const answer = {
      questionId: s.single,
      response: { type: 'single_choice', optionId: 'b' },
      markedForReview: false,
    };
    expect((await save(s, attempt.id, [answer])).status).toBe(200);

    await deadline(-60_000);
    const refused = await save(s, attempt.id, [answer]);
    expect(refused.body.error.code).toBe('ATTEMPT_CLOSED');
    const finished = await ctx.prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(finished).toMatchObject({ status: 'completed', autoSubmitted: true, score: 200 });
    expect(finished.submittedAt).toEqual(finished.deadlineAt);

    // The worker finishes attempts abandoned past their time.
    const second = (await start(s, id)).body;
    await ctx.prisma.attempt.update({
      where: { id: second.id },
      data: { deadlineAt: new Date(Date.now() - 2 * MIN), startedAt: new Date(Date.now() - 30 * MIN) },
    });
    expect(await ctx.app.get(AttemptsService).finishExpired()).toBe(1);
    expect((await ctx.prisma.attempt.findUniqueOrThrow({ where: { id: second.id } })).status).toBe(
      'completed',
    );
  });

  it('applies the window, the late-start rule and the attempt limit (D-048)', async () => {
    const s = await setup();
    const window = (opens: number, closes: number, extra: Record<string, unknown> = {}) =>
      s.assessment(
        { availability: 'window', opensAt: iso(opens), closesAt: iso(closes), durationMinutes: 60, ...extra },
        [s.fixed(s.truth)],
      );
    const upcoming = await window(60 * MIN, 120 * MIN);
    expect((await start(s, upcoming)).body.error).toMatchObject({
      code: 'ASSESSMENT_NOT_AVAILABLE',
      details: { reason: 'not_open' },
    });
    const ended = await window(-120 * MIN, 60 * MIN);
    await ctx.prisma.assessment.update({
      where: { id: ended },
      data: { closesAt: new Date(Date.now() - MIN) },
    });
    expect((await start(s, ended)).body.error.details.reason).toBe('closed');

    const closingSoon = await window(-60 * MIN, 10 * MIN);
    const clipped = (await start(s, closingSoon)).body;
    const closesAt = (await ctx.prisma.assessment.findUniqueOrThrow({ where: { id: closingSoon } }))
      .closesAt!;
    expect(new Date(clipped.deadlineAt)).toEqual(closesAt);

    const fullTime = await window(-60 * MIN, 10 * MIN, { lateStart: 'full_duration' });
    const full = (await start(s, fullTime)).body;
    expect(Date.parse(full.deadlineAt) - Date.parse(full.startedAt)).toBe(60 * MIN);

    const once = await s.assessment({ maxAttempts: 1 }, [s.fixed(s.truth)]);
    await submit(s, (await start(s, once)).body.id);
    expect((await start(s, once)).body.error.details.reason).toBe('no_attempts_left');
  });

  it('applies the Premium access rule (D-048)', async () => {
    const s = await setup();
    const premium = (extra: Record<string, unknown>) =>
      s.assessment({ accessLevel: 'premium', subjectId: null, ...extra }, [s.fixed(s.truth)]);
    const byCourse = await premium({ courseId: s.seeded.course.id });
    const byPost = await premium({ examNodeId: s.seeded.post.id });
    const byAuthority = await premium({ examNodeId: s.seeded.authority.id });
    const bySubject = await premium({ subjectId: s.seeded.subject.id });
    const anyCourse = await premium({ premiumAccess: 'any_course' });
    const plansOnly = await premium({ courseId: s.seeded.course.id, premiumAccess: 'plans_only' });
    const all = [byCourse, byPost, byAuthority, bySubject, anyCourse, plansOnly];

    for (const id of all) {
      const res = await start(s, id);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CONTENT_LOCKED');
      expect((await call(ctx, 'GET', `/assessments/${id}`, { token: s.student })).body.locked).toBe(true);
    }
    expect((await s.grant()).status).toBe(201);
    for (const id of [byCourse, byPost, byAuthority, bySubject, anyCourse])
      expect((await start(s, id)).status).toBe(200);
    expect((await start(s, plansOnly)).status).toBe(403);
  });

  it('keeps scores and answers hidden until results are released', async () => {
    const s = await setup();
    const afterClose = await s.assessment(
      {
        availability: 'window',
        opensAt: iso(-60 * MIN),
        closesAt: iso(60 * MIN),
        resultRelease: 'after_close',
      },
      [s.fixed(s.single)],
    );
    const attempt = (await start(s, afterClose)).body;
    await save(s, attempt.id, [
      { questionId: s.single, response: { type: 'single_choice', optionId: 'b' }, markedForReview: false },
    ]);
    const hidden = (await submit(s, attempt.id)).body;
    expect(hidden).toMatchObject({ released: false, summary: null, questions: [], status: 'completed' });
    expect(hidden.releaseAt).toBeTruthy();
    expect(JSON.stringify(hidden)).not.toContain('correctOptionId');
    expect((await call(ctx, 'GET', '/me/attempts', { token: s.student })).body.data[0].score).toBeNull();

    await ctx.prisma.assessment.update({
      where: { id: afterClose },
      data: { closesAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await call(ctx, 'GET', `/attempts/${attempt.id}/result`, { token: s.student })).body.summary.score,
    ).toBe(200);

    const manual = await s.assessment({ resultRelease: 'manual' }, [s.fixed(s.truth)]);
    const m = (await start(s, manual)).body;
    expect((await submit(s, m.id)).body.released).toBe(false);
    await ctx.prisma.assessment.update({ where: { id: manual }, data: { resultsReleasedAt: new Date() } });
    expect((await call(ctx, 'GET', `/attempts/${m.id}/result`, { token: s.student })).body.released).toBe(
      true,
    );
  });

  it('completes written answers by self-evaluation against the model answer', async () => {
    const s = await setup();
    const id = await s.assessment({ subjectiveGrading: 'self', passMarks: 3 }, [s.fixed(s.written)]);
    const attempt = (await start(s, id)).body;
    expect(JSON.stringify(attempt)).not.toContain('MODEL ANSWER');
    await save(s, attempt.id, [
      {
        questionId: s.written,
        response: { type: 'subjective', text: 'Article 46 lets citizens go to court.' },
        markedForReview: false,
      },
    ]);
    const pending = (await submit(s, attempt.id)).body;
    expect(pending).toMatchObject({
      status: 'pending_grading',
      canSelfGrade: true,
      summary: { pending: 1, passed: null },
    });
    expect(JSON.stringify(pending)).toContain('MODEL ANSWER');

    const tooMuch = await call(ctx, 'POST', `/attempts/${attempt.id}/self-grade`, {
      token: s.student,
      body: { grades: [{ questionId: s.written, awarded: 6 }] },
    });
    expect(tooMuch.status).toBe(400);
    const graded = await call(ctx, 'POST', `/attempts/${attempt.id}/self-grade`, {
      token: s.student,
      body: { grades: [{ questionId: s.written, awarded: 4 }] },
    });
    expect(graded.body).toMatchObject({
      status: 'completed',
      canSelfGrade: false,
      summary: { score: 400, passed: true, pending: 0 },
    });
  });

  it('marks the counted attempt by the assessment rule (D-048)', async () => {
    const s = await setup();
    const id = await s.assessment({ countedAttempt: 'best' }, [s.fixed(s.single)]);
    const take = async (optionId: string) => {
      const a = (await start(s, id)).body;
      await save(s, a.id, [
        { questionId: s.single, response: { type: 'single_choice', optionId }, markedForReview: false },
      ]);
      await submit(s, a.id);
      return a.id as string;
    };
    const first = await take('a');
    const second = await take('b');
    const counted = async () =>
      (await call(ctx, 'GET', `/assessments/${id}`, { token: s.student })).body.attempts
        .filter((a: { counted: boolean }) => a.counted)
        .map((a: { id: string }) => a.id);
    expect(await counted()).toEqual([second]);
    await ctx.prisma.assessment.update({ where: { id }, data: { countedAttempt: 'first' } });
    expect(await counted()).toEqual([first]);
  });

  it('picks random questions per attempt and pins the question versions it started with', async () => {
    const s = await setup();
    const id = await s.assessment({}, [
      s.fixed(s.truth),
      { pickMode: 'random', filter: { subjectId: s.seeded.subject.id, tags: ['pool'] }, questionCount: 2 },
    ]);
    const attempt = (await start(s, id)).body;
    const ids = attempt.sections.flatMap((sec: { questions: Array<{ questionId: string }> }) =>
      sec.questions.map((q) => q.questionId),
    );
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids.slice(1).every((q: string) => s.pool.includes(q))).toBe(true);

    // An edit after the start creates a new version; this attempt keeps the old one.
    const edited = await call(ctx, 'PUT', `/admin/questions/${s.truth}`, {
      token: s.admin,
      body: {
        subjectId: s.seeded.subject.id,
        topicId: s.seeded.topic.id,
        difficulty: 'easy',
        defaultMarks: 1,
        accessLevel: 'premium',
        tags: [],
        content: { type: 'true_false', stem: doc('EDITED statement'), correct: false },
      },
    });
    expect(edited.status).toBe(200);
    const again = await call(ctx, 'GET', `/attempts/${attempt.id}`, { token: s.student });
    expect(JSON.stringify(again.body)).not.toContain('EDITED');
    await save(s, attempt.id, [
      { questionId: s.truth, response: { type: 'true_false', value: true }, markedForReview: false },
    ]);
    const result = (await submit(s, attempt.id)).body;
    expect(result.questions.find((q: { questionId: string }) => q.questionId === s.truth).outcome).toBe(
      'correct',
    );
  });

  it('keeps attempts private, requires verification when set, and erases them with the account', async () => {
    const s = await setup();
    const id = await s.assessment({}, [s.fixed(s.truth)]);
    const attempt = (await start(s, id)).body;
    const other = (await registerStudent(ctx, 'other@example.com')).accessToken;
    expect((await call(ctx, 'GET', `/attempts/${attempt.id}`, { token: other })).status).toBe(404);
    expect((await call(ctx, 'POST', `/attempts/${attempt.id}/submit`, { token: other })).status).toBe(404);

    await setSetting(ctx, 'auth.verification', {
      channels: { email: true, phone: false },
      requiredForLearning: true,
    });
    const unverified = await start(s, id, other);
    expect(unverified.status).toBe(403);
    expect(unverified.body.error.code).toBe('VERIFICATION_REQUIRED');

    await call(ctx, 'POST', '/me/deletion', { token: s.student });
    await ctx.app.get(AccountDeletionService).processDue(new Date(Date.now() + 60 * 86_400_000));
    expect(await ctx.prisma.attempt.count({ where: { userId: s.userId } })).toBe(0);
    expect(await ctx.prisma.attemptAnswer.count()).toBe(0);
  });
});
