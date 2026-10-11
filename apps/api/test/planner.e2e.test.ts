import { planDayAdd } from '@tk/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountDeletionService } from '../src/modules/auth/account-deletion.service.js';
import { nepalDay } from '../src/modules/attempts/engagement.service.js';
import { PlannerService } from '../src/modules/progress/planner.service.js';
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
// Scoring choices are test inputs (D-044), not business defaults.
const scoring = {
  negativeMarking: false,
  multipleChoice: 'all_or_nothing',
  match: 'all_or_nothing',
  fillBlank: 'all_or_nothing',
  scoreFloor: 'zero',
};
type Plan = {
  days: Array<{ day: string; minutes: number; tasks: Array<{ id: string; done: boolean; minutes: number }> }>;
  unscheduled: Array<{ id: string }>;
  [key: string]: unknown;
};
const ids = (plan: Plan) => plan.days.map((d) => d.tasks.map((t) => (t.done ? `${t.id}✓` : t.id)));

async function setup() {
  const admin = await publisher(ctx);
  const seeded = await seedPublishedCourse(ctx, admin);
  // Test estimates (business values are CMS data): notes 10 min, PDF 2 min a page, untimed tests 30 min.
  await setSetting(ctx, 'planner.estimates', {
    noteMinutes: 10,
    pdfMinutesPerPage: 2,
    videoMinutes: 15,
    testMinutes: 30,
  });
  const q = await call(ctx, 'POST', '/admin/questions', {
    token: admin,
    body: {
      subjectId: seeded.subject.id,
      difficulty: 'easy',
      defaultMarks: 1,
      accessLevel: 'free',
      tags: [],
      content: {
        type: 'true_false',
        stem: doc('Nepal is a federal republic.'),
        correct: true,
      },
    },
  });
  if (q.status !== 201) throw new Error(JSON.stringify(q.body));
  await call(ctx, 'PUT', `/admin/questions/${q.body.id}/status`, {
    token: admin,
    body: { status: 'published' },
  });
  const quiz = async (title: string, overrides: Record<string, unknown> = {}) => {
    const created = await call(ctx, 'POST', '/admin/assessments', {
      token: admin,
      body: {
        type: 'quiz',
        title: { en: title },
        courseId: seeded.course.id,
        accessLevel: 'free',
        availability: 'always',
        durationMinutes: 15,
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
      body: { sections: [{ pickMode: 'fixed', questions: [{ questionId: q.body.id }] }] },
    });
    const published = await call(ctx, 'PUT', `/admin/assessments/${id}/publishing`, {
      token: admin,
      body: { status: 'published' },
    });
    if (published.status >= 300) throw new Error(JSON.stringify(published.body));
    return id;
  };
  const student = async (email: string) => {
    const token = (await registerStudent(ctx, email)).accessToken;
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    return { token, id: user.id };
  };
  const grant = async (userId: string) => {
    const res = await call(ctx, 'POST', `/admin/users/${userId}/entitlements`, {
      token: admin,
      body: { courseId: seeded.course.id, endsAt: null },
    });
    expect(res.status).toBe(201);
  };
  // The seeded topic's lessons in course order.
  const lessons = (
    await ctx.prisma.learningItem.findMany({
      where: { topicId: seeded.topic.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
  ).map((i) => i.id);
  return { admin, seeded, quiz, student, grant, lessons, questionId: q.body.id as string };
}

describe('study planner (S7, D-066)', () => {
  it('spreads the course over the days before the exam and re-plans from today', async () => {
    const s = await setup();
    const quizId = await s.quiz('Grammar quiz');
    const asha = await s.student('asha@example.com');
    const today = nepalDay(new Date());
    const plan = (body: unknown) =>
      call(ctx, 'PUT', `/me/study-plans/${s.seeded.course.id}`, { token: asha.token, body });

    // Only for a course the student has.
    expect((await plan({ examDate: planDayAdd(today, 3), minutesPerDay: 20 })).status).toBe(404);
    await s.grant(asha.id);
    // The exam must be after today and within three years; 10 to 600 minutes a day.
    for (const body of [
      { examDate: today, minutesPerDay: 20 },
      { examDate: planDayAdd(today, 1200), minutesPerDay: 20 },
      { examDate: planDayAdd(today, 3), minutesPerDay: 5 },
      { examDate: planDayAdd(today, 3), minutesPerDay: 601 },
      { examDate: 'soon', minutesPerDay: 20 },
    ]) {
      expect((await plan(body)).status, JSON.stringify(body)).toBe(400);
    }

    // Lessons: two notes (10 + 10), a 4-page PDF (8), a 212 s video (4); then the course quiz (15 min).
    const res = await plan({ examDate: planDayAdd(today, 3), minutesPerDay: 20 });
    expect(res.status).toBe(200);
    const minutes = new Map(
      res.body.days.flatMap((d: Plan['days'][number]) => d.tasks.map((t) => [t.id, t.minutes])),
    );
    expect(minutes.get(s.seeded.freeNote.id)).toBe(10);
    expect(minutes.get(s.seeded.premiumPdf.id)).toBe(8);
    expect(minutes.get(s.seeded.freeVideo.id)).toBe(4);
    expect(minutes.get(quizId)).toBe(15);
    expect(res.body).toMatchObject({
      examDate: planDayAdd(today, 3),
      minutesPerDay: 20,
      access: true,
      studyDays: 3,
      minutesLeft: 47,
      lessonsLeft: 4,
      testsLeft: 1,
      neededMinutesPerDay: 16,
      onTrack: true,
      unscheduled: [],
    });
    expect(res.body.days.map((d: { day: string }) => d.day)).toEqual([
      today,
      planDayAdd(today, 1),
      planDayAdd(today, 2),
    ]);
    // Each day holds whole lessons in course order, within 20 minutes; the quiz comes after the lessons.
    const flat = (ids(res.body).flat() as string[]).map((id) => id.replace('✓', ''));
    expect(flat).toEqual([...s.lessons, quizId]);
    for (const d of res.body.days) expect(d.minutes).toBeLessThanOrEqual(20);

    // Finishing a lesson today keeps it in today's plan, ticked.
    await call(ctx, 'PUT', `/learning-items/${s.lessons[0]}/progress`, {
      token: asha.token,
      body: { completed: true },
    });
    const after = await call(ctx, 'GET', `/me/study-plans/${s.seeded.course.id}`, { token: asha.token });
    expect(after.body.days[0].tasks[0]).toMatchObject({ id: s.lessons[0], done: true, kind: 'lesson' });
    expect(after.body).toMatchObject({
      lessonsLeft: 3,
      minutesLeft: 47 - after.body.days[0].tasks[0].minutes,
    });

    // Two days later with nothing more done: re-planned from that day, and behind.
    const later = await ctx.app
      .get(PlannerService)
      .get(asha.id, s.seeded.course.id, new Date(Date.now() + 2 * DAY));
    expect(later.studyDays).toBe(1);
    expect(later.onTrack).toBe(false);
    expect(later.unscheduled.length).toBeGreaterThan(0);
    expect(later.neededMinutesPerDay).toBe(later.minutesLeft);

    // A submitted test counts as done.
    const started = await call(ctx, 'POST', `/assessments/${quizId}/attempts`, { token: asha.token });
    await call(ctx, 'POST', `/attempts/${started.body.id}/submit`, { token: asha.token });
    expect(
      (await call(ctx, 'GET', `/me/study-plans/${s.seeded.course.id}`, { token: asha.token })).body.testsLeft,
    ).toBe(0);

    // The list shows today's work; another student sees nothing of it.
    const list = await call(ctx, 'GET', '/me/study-plans', { token: asha.token });
    expect(list.body.data).toEqual([
      expect.objectContaining({
        courseId: s.seeded.course.id,
        today: expect.objectContaining({ day: today }),
      }),
    ]);
    expect(list.body.data[0].days).toBeUndefined();
    const bina = await s.student('bina@example.com');
    expect((await call(ctx, 'GET', '/me/study-plans', { token: bina.token })).body.data).toEqual([]);
    expect(
      (await call(ctx, 'GET', `/me/study-plans/${s.seeded.course.id}`, { token: bina.token })).status,
    ).toBe(404);
    expect((await call(ctx, 'GET', '/me/study-plans', { token: s.admin })).status).toBe(403);

    // Changing it keeps one plan per course; deleting removes it.
    await plan({ examDate: planDayAdd(today, 30), minutesPerDay: 60 });
    expect(await ctx.prisma.studyPlan.count()).toBe(1);
    expect(
      (await call(ctx, 'DELETE', `/me/study-plans/${s.seeded.course.id}`, { token: asha.token })).status,
    ).toBe(204);
    expect(
      (await call(ctx, 'DELETE', `/me/study-plans/${s.seeded.course.id}`, { token: asha.token })).status,
    ).toBe(404);

    // Erasure removes plans.
    await plan({ examDate: planDayAdd(today, 30), minutesPerDay: 60 });
    await call(ctx, 'POST', '/me/deletion', { token: asha.token });
    await ctx.app.get(AccountDeletionService).processDue(new Date(Date.now() + 60 * DAY));
    expect(await ctx.prisma.studyPlan.count()).toBe(0);
  });

  it('plans only what the student can open, and tests on their opening day', async () => {
    const s = await setup();
    const now = Date.now();
    // Opens in two days (planned then), opens after the exam (left out), closed (left out).
    const soon = await s.quiz('Mock 1', {
      availability: 'window',
      opensAt: new Date(now + 2 * DAY).toISOString(),
      closesAt: new Date(now + 6 * DAY).toISOString(),
    });
    await s.quiz('Mock 2', {
      availability: 'window',
      opensAt: new Date(now + 20 * DAY).toISOString(),
      closesAt: new Date(now + 25 * DAY).toISOString(),
    });
    const closed = await s.quiz('Old mock');
    await ctx.prisma.assessment.update({
      where: { id: closed },
      data: { availability: 'window', opensAt: new Date(now - 5 * DAY), closesAt: new Date(now - DAY) },
    });
    // Premium tests need access the free enrolment does not give.
    const premium = await s.quiz('Premium mock', { accessLevel: 'premium' });

    const bina = await s.student('bina@example.com');
    // A free enrolment gives the course but not its premium content (D-053).
    await s.grant(bina.id);
    await ctx.prisma.entitlement.updateMany({
      where: { userId: bina.id },
      data: { sourceType: 'free_enrol' },
    });
    const today = nepalDay(new Date(now));
    const res = await call(ctx, 'PUT', `/me/study-plans/${s.seeded.course.id}`, {
      token: bina.token,
      body: { examDate: planDayAdd(today, 10), minutesPerDay: 600 },
    });
    expect(res.status).toBe(200);
    const planned = res.body.days.flatMap((d: Plan['days'][number]) => d.tasks.map((t) => t.id));
    // Free lessons only (the premium note and PDF stay locked), the test opening in two days on that day.
    expect(planned.sort()).toEqual([s.seeded.freeNote.id, s.seeded.freeVideo.id, soon].sort());
    expect(planned).not.toContain(premium);
    expect(
      res.body.days
        .find((d: { day: string }) => d.day === planDayAdd(today, 2))
        .tasks.map((t: { id: string }) => t.id),
    ).toEqual([soon]);
  });
});
