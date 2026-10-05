import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { publisher, seedPublishedCourse } from './content-helpers.js';
import {
  call,
  createStaff,
  createTestApp,
  registerStudent,
  staffLogin,
  type TestContext,
} from './helpers.js';

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
  const question = async (content: Record<string, unknown>, marks: number) => {
    const res = await call(ctx, 'POST', '/admin/questions', {
      token: admin,
      body: {
        subjectId: seeded.subject.id,
        difficulty: 'easy',
        defaultMarks: marks,
        accessLevel: 'free',
        tags: [],
        content,
      },
    });
    await call(ctx, 'PUT', `/admin/questions/${res.body.id}/status`, {
      token: admin,
      body: { status: 'published' },
    });
    return res.body.id as string;
  };
  const written = await question(
    {
      type: 'subjective',
      stem: doc('Explain judicial review.'),
      modelAnswer: doc('MODEL: courts test laws against the constitution'),
    },
    5,
  );
  const truth = await question(
    { type: 'true_false', stem: doc('Nepal has seven provinces.'), correct: true },
    1,
  );
  const assessment = async (overrides: Record<string, unknown>, questions: string[]) => {
    const created = await call(ctx, 'POST', '/admin/assessments', {
      token: admin,
      body: {
        type: 'subject_test',
        title: { en: 'Constitution test' },
        subjectId: seeded.subject.id,
        accessLevel: 'free',
        availability: 'always',
        durationMinutes: null,
        maxAttempts: null,
        passMarks: 3,
        scoring,
        shuffleQuestions: false,
        shuffleOptions: false,
        resultRelease: 'manual',
        showExplanations: true,
        leaderboardEnabled: false,
        subjectiveGrading: 'instructor',
        ...overrides,
      },
    });
    const id = created.body.id as string;
    await call(ctx, 'PUT', `/admin/assessments/${id}/structure`, {
      token: admin,
      body: { sections: [{ pickMode: 'fixed', questions: questions.map((questionId) => ({ questionId })) }] },
    });
    await call(ctx, 'PUT', `/admin/assessments/${id}/publishing`, {
      token: admin,
      body: { status: 'published' },
    });
    return id;
  };
  const take = async (token: string, id: string, answers: unknown[]) => {
    const attempt = (await call(ctx, 'POST', `/assessments/${id}/attempts`, { token })).body;
    if (answers.length)
      await call(ctx, 'PUT', `/attempts/${attempt.id}/answers`, { token, body: { answers } });
    await call(ctx, 'POST', `/attempts/${attempt.id}/submit`, { token });
    return attempt.id as string;
  };
  await createStaff(ctx, 'grader@example.com', { permissions: ['grading:manage'] });
  const grader = (await staffLogin(ctx, 'grader@example.com')).token;
  return { admin, seeded, written, truth, assessment, take, grader };
}

const text = (questionId: string, value: string) => ({
  questionId,
  response: { type: 'subjective', text: value },
  markedForReview: false,
});

describe('grading written answers', () => {
  it('queues instructor-graded answers, grades them, and releases results manually', async () => {
    const s = await setup();
    const id = await s.assessment({}, [s.written, s.truth]);
    const student = (await registerStudent(ctx, 'student@example.com')).accessToken;
    const attemptId = await s.take(student, id, [
      text(s.written, 'Courts can strike down laws.'),
      { questionId: s.truth, response: { type: 'true_false', value: true }, markedForReview: false },
    ]);
    const hidden = (await call(ctx, 'GET', `/attempts/${attemptId}/result`, { token: student })).body;
    expect(hidden).toMatchObject({ status: 'pending_grading', released: false, summary: null });

    const queue = await call(ctx, 'GET', '/admin/grading', { token: s.grader });
    expect(queue.status).toBe(200);
    expect(queue.body.total).toBe(1);
    expect(queue.body.assessments).toEqual([expect.objectContaining({ id })]);
    expect(queue.body.data[0]).toMatchObject({
      attemptId,
      questionId: s.written,
      student: 'Asha Rai',
      marks: 500,
      response: { type: 'subjective', text: 'Courts can strike down laws.' },
      answer: { type: 'subjective' },
    });
    expect(JSON.stringify(queue.body)).toContain('MODEL: courts test laws');

    const grade = (awarded: number, comment?: string) =>
      call(ctx, 'PUT', `/admin/attempts/${attemptId}/answers/${s.written}/grade`, {
        token: s.grader,
        body: { awarded, comment },
      });
    expect((await grade(6)).status).toBe(400);
    const graded = await grade(3.5, 'Good, but mention Article 133.');
    expect(graded.status).toBe(200);
    expect(graded.body).toMatchObject({ status: 'completed', score: 450, passed: true, pending: 0 });
    expect((await call(ctx, 'GET', '/admin/grading', { token: s.grader })).body.total).toBe(0);

    // Corrections are allowed and recomputed.
    expect((await grade(1.5)).body).toMatchObject({ score: 250, passed: false });

    // Still hidden from the student until released; releasing needs the publish permission.
    expect((await call(ctx, 'GET', `/attempts/${attemptId}/result`, { token: student })).body.released).toBe(
      false,
    );
    expect(
      (await call(ctx, 'POST', `/admin/assessments/${id}/release-results`, { token: s.grader })).status,
    ).toBe(403);
    const released = await call(ctx, 'POST', `/admin/assessments/${id}/release-results`, { token: s.admin });
    expect(released.status).toBe(200);
    expect(released.body.assessment.released).toBe(true);
    const result = (await call(ctx, 'GET', `/attempts/${attemptId}/result`, { token: student })).body;
    expect(result).toMatchObject({ released: true, summary: { score: 250, passed: false } });
    expect(result.questions.find((q: { questionId: string }) => q.questionId === s.written)).toMatchObject({
      awarded: 150,
      outcome: 'partial',
      graderComment: null,
    });
    // Releasing again changes nothing.
    const again = await call(ctx, 'POST', `/admin/assessments/${id}/release-results`, { token: s.admin });
    expect(again.body.assessment.resultsReleasedAt).toBe(released.body.assessment.resultsReleasedAt);

    const actions = (await ctx.prisma.auditLog.findMany()).map((a) => a.action);
    expect(actions.filter((a) => a === 'attempt.grade')).toHaveLength(2);
    expect(actions.filter((a) => a === 'assessment.results_release')).toHaveLength(1);
  });

  it('shows the grader comment to the student and refuses what cannot be graded', async () => {
    const s = await setup();
    const id = await s.assessment({ resultRelease: 'immediate' }, [s.written, s.truth]);
    const student = (await registerStudent(ctx, 'student@example.com')).accessToken;
    const attemptId = await s.take(student, id, [text(s.written, 'An answer')]);
    const grade = (questionId: string, awarded: number, comment?: string) =>
      call(ctx, 'PUT', `/admin/attempts/${attemptId}/answers/${questionId}/grade`, {
        token: s.grader,
        body: { awarded, comment },
      });
    expect((await grade(s.truth, 1)).status).toBe(400); // auto-scored, not a written answer
    await grade(s.written, 5, 'Excellent');
    const result = (await call(ctx, 'GET', `/attempts/${attemptId}/result`, { token: student })).body;
    expect(
      result.questions.find((q: { questionId: string }) => q.questionId === s.written).graderComment,
    ).toBe('Excellent');

    const blank = await s.take(student, id, []);
    const skipped = await call(ctx, 'PUT', `/admin/attempts/${blank}/answers/${s.written}/grade`, {
      token: s.grader,
      body: { awarded: 1 },
    });
    expect(skipped.status).toBe(400);

    const running = (await call(ctx, 'POST', `/assessments/${id}/attempts`, { token: student })).body;
    const early = await call(ctx, 'PUT', `/admin/attempts/${running.id}/answers/${s.written}/grade`, {
      token: s.grader,
      body: { awarded: 1 },
    });
    expect(early.status).toBe(409);
  });

  it('applies permissions and staff scopes', async () => {
    const s = await setup();
    const id = await s.assessment({}, [s.written]);
    const student = (await registerStudent(ctx, 'student@example.com')).accessToken;
    const attemptId = await s.take(student, id, [text(s.written, 'An answer')]);

    await createStaff(ctx, 'editor@example.com', { permissions: ['assessments:edit'] });
    const editor = (await staffLogin(ctx, 'editor@example.com')).token;
    expect((await call(ctx, 'GET', '/admin/grading', { token: editor })).status).toBe(403);
    expect((await call(ctx, 'GET', `/admin/assessments/${id}/attempts`, { token: editor })).status).toBe(200);

    const other = (
      await call(ctx, 'POST', '/admin/subjects', { token: s.admin, body: { name: { en: 'Other' } } })
    ).body.id;
    const scoped = await createStaff(ctx, 'scoped@example.com', { permissions: ['grading:manage'] });
    await ctx.prisma.staffScope.create({ data: { userId: scoped.id, scopeType: 'subject', scopeId: other } });
    const s2 = (await staffLogin(ctx, 'scoped@example.com')).token;
    expect((await call(ctx, 'GET', '/admin/grading', { token: s2 })).body.total).toBe(0);
    expect((await call(ctx, 'GET', `/admin/attempts/${attemptId}`, { token: s2 })).status).toBe(403);
    expect(
      (
        await call(ctx, 'PUT', `/admin/attempts/${attemptId}/answers/${s.written}/grade`, {
          token: s2,
          body: { awarded: 1 },
        })
      ).status,
    ).toBe(403);
    expect((await call(ctx, 'GET', `/admin/assessments/${id}/attempts`, { token: s2 })).status).toBe(403);
  });
});

describe('results per assessment', () => {
  it('lists attempts and computes statistics from each student official attempt', async () => {
    const s = await setup();
    const id = await s.assessment(
      { resultRelease: 'immediate', subjectiveGrading: 'none', passMarks: 1, countedAttempt: 'first' },
      [s.truth],
    );
    const answer = (value: boolean) => [
      { questionId: s.truth, response: { type: 'true_false', value }, markedForReview: false },
    ];
    const asha = (await registerStudent(ctx, 'asha@example.com')).accessToken;
    const ram = (await registerStudent(ctx, 'ram@example.com')).accessToken;
    const ashaFirst = await s.take(asha, id, answer(false));
    await s.take(asha, id, answer(true));
    await s.take(ram, id, answer(true));

    const res = await call(ctx, 'GET', `/admin/assessments/${id}/attempts`, { token: s.admin });
    expect(res.status).toBe(200);
    expect(res.body.stats).toEqual({
      attempts: 3,
      students: 2,
      inProgress: 0,
      pendingGrading: 0,
      averageScore: 50, // official: Asha's first (0) and Ram's (100) → 50 centimarks
      passed: 1,
      withPassMark: 2,
    });
    expect(res.body.data).toHaveLength(3);
    const official = res.body.data
      .filter((t: { official: boolean }) => t.official)
      .map((t: { id: string }) => t.id);
    expect(official).toContain(ashaFirst);
    expect(official).toHaveLength(2);

    const detail = await call(ctx, 'GET', `/admin/attempts/${ashaFirst}`, { token: s.admin });
    expect(detail.body).toMatchObject({
      student: { fullName: 'Asha Rai' },
      score: 0,
      questions: [{ questionId: s.truth, outcome: 'wrong', answer: { correct: true } }],
    });
    // Automatic release cannot be "released" by hand.
    expect(
      (await call(ctx, 'POST', `/admin/assessments/${id}/release-results`, { token: s.admin })).status,
    ).toBe(409);
  });
});
