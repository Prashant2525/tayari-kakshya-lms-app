import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { call, createStaff, createTestApp, staffLogin, type TestContext } from './helpers.js';

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

const PERMS = [
  'questions:edit',
  'questions:publish',
  'assessments:edit',
  'assessments:publish',
  'content:edit',
  'content:publish',
];
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
// Scoring choices are arbitrary test inputs, not business defaults (D-044).
const scoring = {
  negativeMarking: true,
  multipleChoice: 'all_or_nothing',
  match: 'per_pair',
  fillBlank: 'per_blank',
  scoreFloor: 'zero',
};

function quiz(extra: Record<string, unknown> = {}) {
  return {
    type: 'quiz',
    title: { en: 'Constitution quiz' },
    accessLevel: 'premium',
    availability: 'always',
    durationMinutes: 20,
    maxAttempts: null,
    passMarks: null,
    scoring,
    shuffleQuestions: true,
    shuffleOptions: true,
    resultRelease: 'immediate',
    showExplanations: true,
    leaderboardEnabled: false,
    subjectiveGrading: 'none',
    ...extra,
  };
}

async function setup() {
  await createStaff(ctx, 'assess@example.com', { permissions: PERMS });
  const token = (await staffLogin(ctx, 'assess@example.com')).token;
  const subject = (await call(ctx, 'POST', '/admin/subjects', { token, body: { name: { en: 'GK' } } })).body
    .id as string;
  const question = async (
    opts: { marks?: number; type?: string; publish?: boolean; tags?: string[] } = {},
  ) => {
    const content =
      opts.type === 'subjective'
        ? { type: 'subjective', stem: doc('Explain'), modelAnswer: doc('Model') }
        : { type: 'true_false', stem: doc(`Statement ${Math.random()}`), correct: true };
    const q = (
      await call(ctx, 'POST', '/admin/questions', {
        token,
        body: {
          subjectId: subject,
          difficulty: 'easy',
          defaultMarks: opts.marks ?? 1,
          accessLevel: 'premium',
          tags: opts.tags ?? [],
          content,
        },
      })
    ).body;
    if (opts.publish !== false)
      await call(ctx, 'PUT', `/admin/questions/${q.id}/status`, { token, body: { status: 'published' } });
    return q.id as string;
  };
  return { token, subject, question };
}

const create = (token: string, body: unknown) => call(ctx, 'POST', '/admin/assessments', { token, body });
const structure = (token: string, id: string, sections: unknown[]) =>
  call(ctx, 'PUT', `/admin/assessments/${id}/structure`, { token, body: { sections } });
const publish = (token: string, id: string, status = 'published') =>
  call(ctx, 'PUT', `/admin/assessments/${id}/publishing`, { token, body: { status } });

describe('assessment builder', () => {
  it('builds fixed and random sections, reports readiness, and only publishes when ready', async () => {
    const { token, subject, question } = await setup();
    const a = await create(token, quiz({ subjectId: subject }));
    expect(a.status).toBe(201);
    expect(a.body.readiness).toMatchObject({ ready: false, questions: 0 });
    expect(a.body.readiness.problems[0].message).toContain('Add at least one section');
    const refused = await publish(token, a.body.id);
    expect(refused.status).toBe(400);
    expect(refused.body.error.details.problems.length).toBeGreaterThan(0);

    const q1 = await question({ marks: 2 });
    const draft = await question({ publish: false });
    const pool = await Promise.all(Array.from({ length: 4 }, () => question({ marks: 1, tags: ['rights'] })));
    void pool;
    let s = await structure(token, a.body.id, [
      {
        title: { en: 'Part A' },
        pickMode: 'fixed',
        questions: [{ questionId: q1 }, { questionId: draft, marks: 3 }],
      },
      { pickMode: 'random', filter: { subjectId: subject, tags: ['rights'] }, questionCount: 5 },
    ]);
    expect(s.status).toBe(200);
    expect(s.body.readiness.problems.map((p: { message: string }) => p.message)).toEqual([
      '1 question(s) are not published (or were deleted)',
      'Needs 5 questions but only 4 published questions match',
    ]);

    await call(ctx, 'PUT', `/admin/questions/${draft}/status`, { token, body: { status: 'published' } });
    s = await structure(token, a.body.id, [
      {
        title: { en: 'Part A' },
        pickMode: 'fixed',
        questions: [{ questionId: q1 }, { questionId: draft, marks: 3 }],
      },
      {
        pickMode: 'random',
        filter: { subjectId: subject, tags: ['rights'] },
        questionCount: 4,
        marksPerQuestion: 0.5,
      },
    ]);
    // 2 (default) + 3 (override) + 4 × 0.5 (section marks)
    expect(s.body.readiness).toMatchObject({ ready: true, questions: 6, totalMarks: { min: 7, max: 7 } });
    expect(s.body.sections[0].questions.map((q: { marks: number | null }) => q.marks)).toEqual([null, 3]);
    expect((await publish(token, a.body.id)).status).toBe(204);
    expect((await call(ctx, 'GET', `/admin/assessments/${a.body.id}`, { token })).body.status).toBe(
      'published',
    );

    // A question used by a live assessment cannot be deleted.
    expect((await call(ctx, 'DELETE', `/admin/questions/${q1}`, { token })).status).toBe(409);
    const list = await call(ctx, 'GET', '/admin/assessments', { token });
    expect(list.body.data[0]).toMatchObject({ type: 'quiz', status: 'published', questionCount: 6 });
  });

  it('flags mixed marks, written answers without a grading mode, and impossible pass marks', async () => {
    const { token, subject, question } = await setup();
    await question({ marks: 1 });
    await question({ marks: 2 });
    await question({ type: 'subjective', marks: 5 });
    const a = (await create(token, quiz({ subjectId: subject, passMarks: 50 }))).body;
    const s = await structure(token, a.id, [
      { pickMode: 'random', filter: { subjectId: subject }, questionCount: 3 },
    ]);
    const r = s.body.readiness;
    expect(r.totalMarks).toEqual({ min: 3, max: 15 });
    expect(r.warnings[0].message).toContain('different marks');
    expect(r.problems.map((p: { message: string }) => p.message)).toEqual([
      'There are written (subjective) questions: choose self-evaluation or instructor grading',
      'Pass marks (50) are higher than the total marks (3)',
    ]);
  });

  it('validates rules: windows, result timing, daily challenges and links', async () => {
    const { token, subject } = await setup();
    expect((await create(token, quiz({ availability: 'window' }))).status).toBe(400);
    const badWindow = await create(
      token,
      quiz({
        availability: 'window',
        opensAt: '2030-01-02T00:00:00.000Z',
        closesAt: '2030-01-01T00:00:00.000Z',
      }),
    );
    expect(JSON.stringify(badWindow.body)).toContain('close after it opens');
    expect((await create(token, quiz({ resultRelease: 'after_close' }))).status).toBe(400);
    expect((await create(token, quiz({ type: 'daily_challenge' }))).status).toBe(400);
    const day = { type: 'daily_challenge', challengeDate: '2030-01-15', subjectId: subject };
    expect((await create(token, quiz(day))).status).toBe(201);
    const second = await create(token, quiz(day));
    expect(second.status).toBe(409);
    expect(second.body.error.message).toContain('already a daily challenge');
    const other = (await call(ctx, 'POST', '/admin/subjects', { token, body: { name: { en: 'Maths' } } }))
      .body.id;
    const chapter = (
      await call(ctx, 'POST', `/admin/subjects/${other}/chapters`, {
        token,
        body: { title: { en: 'Algebra' } },
      })
    ).body.id;
    expect((await create(token, quiz({ subjectId: subject, chapterId: chapter }))).status).toBe(400);
    const windowed = await create(
      token,
      quiz({
        type: 'weekly',
        availability: 'window',
        opensAt: '2030-01-01T03:15:00.000Z',
        closesAt: '2030-01-01T05:15:00.000Z',
        resultRelease: 'after_close',
        leaderboardEnabled: true,
      }),
    );
    expect(windowed.status).toBe(201);
    expect(windowed.body).toMatchObject({
      availability: 'window',
      resultRelease: 'after_close',
      durationMinutes: 20,
    });
  });

  it('serves the prefill for new assessments with scoring choices unset', async () => {
    const { token } = await setup();
    const res = await call(ctx, 'GET', '/admin/assessments/defaults', { token });
    expect(res.body).toEqual({
      resultRelease: 'immediate',
      showExplanations: true,
      maxAttempts: null,
      // D-048 (owner, 2026-10-04): editable in Settings → Assessment defaults.
      premiumAccess: 'linked',
      lateStart: 'until_close',
      countedAttempt: 'first',
      scoring: {
        negativeMarking: null,
        multipleChoice: null,
        match: null,
        fillBlank: null,
        scoreFloor: null,
      },
    });
  });

  it('rejects broken structures', async () => {
    const { token, subject, question } = await setup();
    const a = (await create(token, quiz({ subjectId: subject }))).body;
    const q = await question();
    expect((await structure(token, a.id, [{ pickMode: 'fixed', questions: [] }])).status).toBe(400);
    expect(
      (
        await structure(token, a.id, [
          { pickMode: 'fixed', questions: [{ questionId: q }] },
          { pickMode: 'fixed', questions: [{ questionId: q }] },
        ])
      ).status,
    ).toBe(400);
    expect(
      (
        await structure(token, a.id, [
          { pickMode: 'fixed', questions: [{ questionId: '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b' }] },
        ])
      ).status,
    ).toBe(400);
    expect((await structure(token, a.id, [{ pickMode: 'random', questionCount: 3 }])).status).toBe(400);
  });

  it('enforces publishing rights and staff scopes', async () => {
    const { token, subject, question } = await setup();
    const a = (await create(token, quiz({ subjectId: subject }))).body;
    await structure(token, a.id, [{ pickMode: 'fixed', questions: [{ questionId: await question() }] }]);
    await createStaff(ctx, 'editor@example.com', { permissions: ['assessments:edit'] });
    const editor = (await staffLogin(ctx, 'editor@example.com')).token;
    expect((await publish(editor, a.id, 'in_review')).status).toBe(204);
    expect((await publish(editor, a.id)).status).toBe(403);
    expect((await publish(token, a.id)).status).toBe(204);
    expect(
      (
        await call(ctx, 'PUT', `/admin/assessments/${a.id}`, {
          token: editor,
          body: quiz({ subjectId: subject }),
        })
      ).status,
    ).toBe(403);

    const other = (await call(ctx, 'POST', '/admin/subjects', { token, body: { name: { en: 'Other' } } }))
      .body.id;
    const scoped = await createStaff(ctx, 'scoped@example.com', { permissions: ['assessments:edit'] });
    await ctx.prisma.staffScope.create({ data: { userId: scoped.id, scopeType: 'subject', scopeId: other } });
    const s = (await staffLogin(ctx, 'scoped@example.com')).token;
    expect((await call(ctx, 'GET', '/admin/assessments', { token: s })).body.data).toHaveLength(0);
    expect((await call(ctx, 'GET', `/admin/assessments/${a.id}`, { token: s })).status).toBe(403);
    expect((await create(s, quiz({ subjectId: subject }))).status).toBe(403);
    expect((await create(s, quiz({ subjectId: other }))).status).toBe(201);
    expect((await create(s, quiz())).status).toBe(403); // general assessments are for unscoped staff

    const actions = (await ctx.prisma.auditLog.findMany({ where: { entityId: a.id } })).map((x) => x.action);
    expect(actions).toEqual(
      expect.arrayContaining(['assessment.create', 'assessment.structure', 'assessment.status']),
    );
  });
});
