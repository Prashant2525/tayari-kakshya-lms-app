import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { note, publisher, seedPublishedCourse } from './content-helpers.js';
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

const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
const checks = (body: { checks: Array<{ key: string; ok: boolean }> }) =>
  Object.fromEntries(body.checks.map((c) => [c.key, c.ok]));

describe('content QA (S23, D-075)', () => {
  it('lists what a lesson and a course still need before students can use them', async () => {
    const token = await publisher(ctx);
    const s = await seedPublishedCourse(ctx, token);

    const ready = await call(ctx, 'GET', `/admin/learning-items/${s.freeNote.id}/checklist`, { token });
    expect(ready.status).toBe(200);
    expect(ready.body.ready).toBe(true);
    expect(checks(ready.body)).toMatchObject({
      title_en: true,
      title_ne: false,
      body: true,
      body_ne: false,
      path_published: true,
      in_course: true,
    });

    // A lesson in a draft topic cannot be reached, and an empty note has nothing to read.
    const topic = await call(ctx, 'POST', `/admin/chapters/${s.chapter.id}/topics`, {
      token,
      body: { numberLabel: '1.9', title: { en: 'Drafts' } },
    });
    const draft = await call(ctx, 'POST', `/admin/topics/${topic.body.id}/items`, {
      token,
      body: { type: 'note', title: { en: 'Later', ne: 'पछि' }, accessLevel: 'free', noteContent: note(' ') },
    });
    const notReady = await call(ctx, 'GET', `/admin/learning-items/${draft.body.id}/checklist`, { token });
    expect(notReady.body.ready).toBe(false);
    expect(checks(notReady.body)).toMatchObject({ title_ne: true, body: false, path_published: false });

    const course = await call(ctx, 'GET', `/admin/courses/${s.course.id}/checklist`, { token });
    expect(course.body.ready).toBe(true);
    expect(checks(course.body)).toMatchObject({ subjects: true, lessons: true, exams: true, price: true });

    // Staff limited to other courses cannot look.
    await createStaff(ctx, 'scoped@example.com', { permissions: ['courses:edit', 'content:edit'] });
    const scopedUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'scoped@example.com' } });
    await ctx.prisma.staffScope.create({
      data: { userId: scopedUser.id, scopeType: 'course', scopeId: '00000000-0000-7000-8000-000000000000' },
    });
    const scoped = (await staffLogin(ctx, 'scoped@example.com')).token;
    expect(
      (await call(ctx, 'GET', `/admin/courses/${s.course.id}/checklist`, { token: scoped })).status,
    ).toBe(403);
  });

  it('previews a test as a student sees it, without answers or explanations', async () => {
    const token = await publisher(ctx);
    const s = await seedPublishedCourse(ctx, token);
    const question = await call(ctx, 'POST', '/admin/questions', {
      token,
      body: {
        subjectId: s.subject.id,
        difficulty: 'easy',
        defaultMarks: 2,
        accessLevel: 'free',
        tags: [],
        content: {
          type: 'single_choice',
          stem: doc('Which article guarantees equality?'),
          options: [
            { id: 'a', content: doc('Article 16') },
            { id: 'b', content: doc('Article 18') },
          ],
          correctOptionId: 'b',
          explanation: doc('SECRET EXPLANATION'),
        },
      },
    });
    const test = await call(ctx, 'POST', '/admin/assessments', {
      token,
      body: {
        type: 'subject_test',
        title: { en: 'Constitution test' },
        subjectId: s.subject.id,
        accessLevel: 'free',
        availability: 'always',
        durationMinutes: 20,
        maxAttempts: null,
        passMarks: 1,
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
        subjectiveGrading: 'instructor',
      },
    });
    await call(ctx, 'PUT', `/admin/assessments/${test.body.id}/structure`, {
      token,
      body: {
        sections: [
          { pickMode: 'fixed', questions: [{ questionId: question.body.id }] },
          { pickMode: 'random', questionCount: 5, filter: { subjectId: s.subject.id } },
        ],
      },
    });

    const preview = await call(ctx, 'GET', `/admin/assessments/${test.body.id}/preview`, { token });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      title: { en: 'Constitution test' },
      durationMinutes: 20,
      sections: [
        {
          pickMode: 'fixed',
          questionCount: 1,
          questions: [
            {
              number: 1,
              marks: 2,
              question: { type: 'single_choice', options: [{ id: 'a' }, { id: 'b' }] },
            },
          ],
        },
        { pickMode: 'random', questionCount: 5, questions: [] },
      ],
    });
    const text = JSON.stringify(preview.body);
    expect(text).not.toContain('SECRET EXPLANATION');
    expect(text).not.toContain('correctOptionId');

    await createStaff(ctx, 'grader@example.com', { permissions: ['grading:manage'] });
    const grader = (await staffLogin(ctx, 'grader@example.com')).token;
    expect(
      (await call(ctx, 'GET', `/admin/assessments/${test.body.id}/preview`, { token: grader })).status,
    ).toBe(403);
  });
});
