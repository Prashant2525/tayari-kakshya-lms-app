import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountDeletionService } from '../src/modules/auth/account-deletion.service.js';
import { nepalDay } from '../src/modules/attempts/engagement.service.js';
import { addDays } from '../src/modules/progress/progress.service.js';
import { publisher, seedPublishedCourse } from './content-helpers.js';
import {
  call,
  createStaff,
  createTestApp,
  registerStudent,
  setSetting,
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

async function student(email: string) {
  const token = (await registerStudent(ctx, email)).accessToken;
  const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
  return { token, id: user.id };
}

const report = (token: string, body: unknown) => call(ctx, 'POST', '/me/study-time', { token, body });
const progress = (token: string) => call(ctx, 'GET', '/me/progress', { token });
/** Moves the student's study clock back, as if their previous report was `seconds` ago. */
const clockAgo = (userId: string, seconds: number) =>
  ctx.prisma.studyClock.update({
    where: { userId },
    data: { lastReportAt: new Date(Date.now() - seconds * 1000) },
  });

describe('study time (D-066)', () => {
  it('adds measured time per Nepal day and activity, never faster than the clock', async () => {
    const asha = await student('asha@example.com');

    // The first report starts the clock and counts in full.
    let res = await report(asha.token, { activity: 'video', seconds: 60 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ credited: 60 });
    // Right after it, a long claim is cut to the time that actually passed (plus a few seconds of slack).
    res = await report(asha.token, { activity: 'reading', seconds: 300 });
    expect(res.body.credited).toBeGreaterThan(0);
    expect(res.body.credited).toBeLessThanOrEqual(7);
    const readingNow = res.body.credited as number;
    // With the time really passed, the whole report counts.
    await clockAgo(asha.id, 120);
    expect((await report(asha.token, { activity: 'practice', seconds: 100 })).body).toEqual({
      credited: 100,
    });
    await clockAgo(asha.id, 600);
    expect((await report(asha.token, { activity: 'test', seconds: 300 })).body).toEqual({ credited: 300 });
    await clockAgo(asha.id, 600);
    expect((await report(asha.token, { activity: 'video', seconds: 40 })).body).toEqual({ credited: 40 });

    // Out-of-range or unknown values are refused.
    for (const body of [
      { activity: 'video', seconds: 0 },
      { activity: 'video', seconds: 301 },
      { activity: 'video', seconds: 1.5 },
      { activity: 'gaming', seconds: 10 },
      {},
    ]) {
      expect((await report(asha.token, body)).status, JSON.stringify(body)).toBe(400);
    }

    // Older days: one inside the 30-day month, one outside it.
    const today = nepalDay(new Date());
    await ctx.prisma.studyTime.createMany({
      data: [
        {
          userId: asha.id,
          day: new Date(`${addDays(today, -10)}T00:00:00Z`),
          activity: 'reading',
          seconds: 1200,
        },
        {
          userId: asha.id,
          day: new Date(`${addDays(today, -40)}T00:00:00Z`),
          activity: 'reading',
          seconds: 9999,
        },
        {
          userId: asha.id,
          day: new Date(`${addDays(today, -2)}T00:00:00Z`),
          activity: 'practice',
          seconds: 600,
        },
      ],
    });

    const p = await progress(asha.token);
    expect(p.status).toBe(200);
    const days = p.body.studyTime.days as Array<{ day: string; seconds: Record<string, number> }>;
    expect(days.map((d) => d.day)).toEqual([-6, -5, -4, -3, -2, -1, 0].map((n) => addDays(today, n)));
    expect(days[6]!.seconds).toEqual({ video: 100, reading: readingNow, practice: 100, test: 300 });
    expect(days[4]!.seconds).toEqual({ video: 0, reading: 0, practice: 600, test: 0 });
    const todaySeconds = 100 + readingNow + 100 + 300;
    expect(p.body.studyTime.todaySeconds).toBe(todaySeconds);
    expect(p.body.studyTime.weekSeconds).toBe(todaySeconds + 600);
    expect(p.body.studyTime.monthSeconds).toBe(todaySeconds + 600 + 1200);

    // Only the student's own time; staff and signed-out callers cannot use these.
    const bina = await student('bina@example.com');
    expect((await progress(bina.token)).body.studyTime.monthSeconds).toBe(0);
    expect((await call(ctx, 'GET', '/me/progress')).status).toBe(401);
    expect(
      (await call(ctx, 'POST', '/me/study-time', { body: { activity: 'video', seconds: 5 } })).status,
    ).toBe(401);
    const staff = await publisher(ctx);
    expect((await progress(staff)).status).toBe(403);
  });
});

describe('accuracy and weak / strong topics (S8)', () => {
  it('counts server-scored practice and revision answers and released test answers only', async () => {
    const admin = await publisher(ctx);
    const seeded = await seedPublishedCourse(ctx, admin);
    await setSetting(ctx, 'progress.topics', {
      windowDays: 90,
      minAnswers: 3,
      weakBelow: 50,
      strongFrom: 80,
    });

    // A second topic in the same chapter.
    const verbs = await call(ctx, 'POST', `/admin/chapters/${seeded.chapter.id}/topics`, {
      token: admin,
      body: { numberLabel: '1.2', title: { en: 'Verbs' } },
    });
    await call(ctx, 'PUT', `/admin/topics/${verbs.body.id}/status`, {
      token: admin,
      body: { status: 'published' },
    });

    const question = async (content: Record<string, unknown>, topicId?: string) => {
      const q = await call(ctx, 'POST', '/admin/questions', {
        token: admin,
        body: {
          subjectId: seeded.subject.id,
          ...(topicId ? { topicId } : {}),
          difficulty: 'easy',
          defaultMarks: 1,
          accessLevel: 'free',
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
    const single = (topicId?: string) =>
      question(
        {
          type: 'single_choice',
          stem: doc('Capital of Nepal?'),
          options: [opt('a', 'Pokhara'), opt('b', 'Kathmandu')],
          correctOptionId: 'b',
        },
        topicId,
      );
    const multi = (topicId?: string) =>
      question(
        {
          type: 'multiple_choice',
          stem: doc('Which are rivers?'),
          options: [opt('a', 'Koshi'), opt('b', 'Everest'), opt('c', 'Gandaki')],
          correctOptionIds: ['a', 'c'],
        },
        topicId,
      );
    const articlesQ = await single(seeded.topic.id);
    const verbsQ = await multi(verbs.body.id);
    const noTopicQ = await single();
    const essay = await question({ type: 'subjective', stem: doc('Explain.'), modelAnswer: doc('Because.') });

    const asha = await student('asha@example.com');
    const check = (id: string, response: unknown) =>
      call(ctx, 'POST', `/practice-questions/${id}/check`, { token: asha.token, body: { response } });
    const right = { type: 'single_choice', optionId: 'b' };
    // Articles: 3 correct → strong. Verbs: wrong, wrong, partial → weak. No topic: counts for the subject only.
    for (let i = 0; i < 3; i++) expect((await check(articlesQ, right)).body.outcome).toBe('correct');
    expect((await check(verbsQ, { type: 'multiple_choice', optionIds: ['b'] })).body.outcome).toBe('wrong');
    expect((await check(verbsQ, { type: 'multiple_choice', optionIds: ['b'] })).body.outcome).toBe('wrong');
    expect((await check(verbsQ, { type: 'multiple_choice', optionIds: ['a'] })).body.outcome).toBe('partial');
    expect((await check(noTopicQ, { type: 'single_choice', optionId: 'a' })).body.outcome).toBe('wrong');
    // Unanswered and written answers never count.
    expect((await check(noTopicQ, { type: 'single_choice', optionId: null })).body.outcome).toBe('skipped');
    expect((await check(essay, { type: 'subjective', text: 'x' })).status).toBe(400);
    expect(await ctx.prisma.practiceAnswer.count()).toBe(7);

    let p = (await progress(asha.token)).body;
    expect(p.windowDays).toBe(90);
    expect(p.thresholds).toEqual({ minAnswers: 3, weakBelow: 50, strongFrom: 80 });
    // 3 correct + 1 partial of 7: (3 + 0.5) / 7 = 50 %.
    expect(p.accuracy).toEqual({ answered: 7, correct: 3, partial: 1, wrong: 3, accuracy: 50 });
    expect(p.subjects).toEqual([
      {
        subjectId: seeded.subject.id,
        subject: { en: 'English', ne: 'अंग्रेजी' },
        answered: 7,
        correct: 3,
        partial: 1,
        wrong: 3,
        accuracy: 50,
      },
    ]);
    expect(p.weakTopics).toEqual([
      expect.objectContaining({ topicId: verbs.body.id, topic: { en: 'Verbs' }, answered: 3, accuracy: 17 }),
    ]);
    expect(p.strongTopics).toEqual([
      expect.objectContaining({
        topicId: seeded.topic.id,
        topic: { en: 'Articles' },
        answered: 3,
        accuracy: 100,
      }),
    ]);

    // A revision answer (scored on the server) counts too.
    const revised = await call(ctx, 'POST', `/me/mistakes/${verbsQ}/review`, {
      token: asha.token,
      body: { response: { type: 'multiple_choice', optionIds: ['a', 'c'] } },
    });
    expect(revised.body.outcome).toBe('correct');
    p = (await progress(asha.token)).body;
    expect(p.accuracy).toMatchObject({ answered: 8, correct: 4 });
    expect(p.weakTopics[0]).toMatchObject({ topicId: verbs.body.id, answered: 4, accuracy: 38 });

    // A test whose results staff release by hand: nothing counts, and no score shows, until they do.
    const created = await call(ctx, 'POST', '/admin/assessments', {
      token: admin,
      body: {
        type: 'quiz',
        title: { en: 'Weekly quiz' },
        accessLevel: 'free',
        availability: 'always',
        durationMinutes: 10,
        maxAttempts: null,
        passMarks: null,
        scoring,
        shuffleQuestions: false,
        shuffleOptions: false,
        resultRelease: 'manual',
        showExplanations: true,
        leaderboardEnabled: false,
        subjectiveGrading: 'none',
      },
    });
    const quiz = created.body.id as string;
    await call(ctx, 'PUT', `/admin/assessments/${quiz}/structure`, {
      token: admin,
      body: {
        sections: [{ pickMode: 'fixed', questions: [{ questionId: articlesQ }, { questionId: noTopicQ }] }],
      },
    });
    await call(ctx, 'PUT', `/admin/assessments/${quiz}/publishing`, {
      token: admin,
      body: { status: 'published' },
    });
    const started = await call(ctx, 'POST', `/assessments/${quiz}/attempts`, { token: asha.token });
    await call(ctx, 'PUT', `/attempts/${started.body.id}/answers`, {
      token: asha.token,
      body: {
        answers: [
          { questionId: articlesQ, response: right, markedForReview: false },
          { questionId: noTopicQ, response: right, markedForReview: false },
        ],
      },
    });
    expect(
      (await call(ctx, 'POST', `/attempts/${started.body.id}/submit`, { token: asha.token })).status,
    ).toBe(200);
    p = (await progress(asha.token)).body;
    expect(p.accuracy.answered).toBe(8);
    expect(p.tests).toEqual([]);

    expect(
      (await call(ctx, 'POST', `/admin/assessments/${quiz}/release-results`, { token: admin })).status,
    ).toBeLessThan(300);
    p = (await progress(asha.token)).body;
    expect(p.accuracy).toMatchObject({ answered: 10, correct: 6 });
    expect(p.tests).toEqual([
      expect.objectContaining({ attemptId: started.body.id, title: { en: 'Weekly quiz' }, percent: 100 }),
    ]);

    // Answers older than the window drop out; another student sees only their own.
    await ctx.prisma.practiceAnswer.updateMany({
      where: { questionId: verbsQ },
      data: { answeredAt: new Date(Date.now() - 100 * DAY) },
    });
    p = (await progress(asha.token)).body;
    expect(p.accuracy).toMatchObject({ answered: 6, correct: 5 });
    expect(p.weakTopics).toEqual([]);
    const bina = await student('bina@example.com');
    expect((await progress(bina.token)).body).toMatchObject({
      accuracy: { answered: 0, accuracy: null },
      subjects: [],
      weakTopics: [],
      strongTopics: [],
      tests: [],
    });

    // A topic needs at least `minAnswers` (3) answers before it is called weak or strong.
    const tenses = await call(ctx, 'POST', `/admin/chapters/${seeded.chapter.id}/topics`, {
      token: admin,
      body: { numberLabel: '1.3', title: { en: 'Tenses' } },
    });
    await call(ctx, 'PUT', `/admin/topics/${tenses.body.id}/status`, {
      token: admin,
      body: { status: 'published' },
    });
    const tensesQ = await single(tenses.body.id);
    const wrong = { type: 'single_choice', optionId: 'a' };
    await check(tensesQ, wrong);
    await check(tensesQ, wrong);
    expect((await progress(asha.token)).body.weakTopics).toEqual([]);
    await check(tensesQ, wrong);
    expect((await progress(asha.token)).body.weakTopics).toEqual([
      expect.objectContaining({ topicId: tenses.body.id, answered: 3, accuracy: 0 }),
    ]);

    // Erasing the account removes its answers and study time.
    await report(asha.token, { activity: 'reading', seconds: 30 });
    await call(ctx, 'POST', '/me/deletion', { token: asha.token });
    await ctx.app.get(AccountDeletionService).processDue(new Date(Date.now() + 60 * DAY));
    expect(await ctx.prisma.practiceAnswer.count({ where: { userId: asha.id } })).toBe(0);
    expect(await ctx.prisma.studyTime.count({ where: { userId: asha.id } })).toBe(0);
    expect(await ctx.prisma.studyClock.count({ where: { userId: asha.id } })).toBe(0);
  });

  it('refuses thresholds where the weak line is above the strong line', async () => {
    await createStaff(ctx, 'admin@example.com', { superAdmin: true });
    const { token } = await staffLogin(ctx, 'admin@example.com');
    const put = (value: unknown) =>
      call(ctx, 'PUT', '/admin/settings/progress.topics', { token, body: { value } });
    expect((await put({ windowDays: 90, minAnswers: 5, weakBelow: 90, strongFrom: 60 })).status).toBe(400);
    expect((await put({ windowDays: 3, minAnswers: 5, weakBelow: 50, strongFrom: 80 })).status).toBe(400);
    expect((await put({ windowDays: 30, minAnswers: 4, weakBelow: 60, strongFrom: 85 })).status).toBeLessThan(
      300,
    );
  });
});
