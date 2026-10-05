import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nepalDay } from '../src/modules/attempts/engagement.service.js';
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
// Scoring choices are test inputs (D-044), not business defaults.
const scoring = {
  negativeMarking: false,
  multipleChoice: 'all_or_nothing',
  match: 'all_or_nothing',
  fillBlank: 'all_or_nothing',
  scoreFloor: 'zero',
};
const DAY = 86_400_000;
const today = () => nepalDay(new Date());
const dayOffset = (days: number) => nepalDay(new Date(Date.now() + days * DAY));

async function setup() {
  const admin = await publisher(ctx);
  const seeded = await seedPublishedCourse(ctx, admin);
  const q = await call(ctx, 'POST', '/admin/questions', {
    token: admin,
    body: {
      subjectId: seeded.subject.id,
      difficulty: 'easy',
      defaultMarks: 1,
      accessLevel: 'free',
      tags: [],
      content: { type: 'true_false', stem: doc('Nepal has seven provinces.'), correct: true },
    },
  });
  await call(ctx, 'PUT', `/admin/questions/${q.body.id}/status`, {
    token: admin,
    body: { status: 'published' },
  });
  const question = q.body.id as string;
  const assessment = async (overrides: Record<string, unknown>) => {
    const created = await call(ctx, 'POST', '/admin/assessments', {
      token: admin,
      body: {
        type: 'quiz',
        title: { en: 'Quiz' },
        accessLevel: 'free',
        availability: 'always',
        durationMinutes: 5,
        maxAttempts: null,
        passMarks: null,
        scoring,
        shuffleQuestions: false,
        shuffleOptions: false,
        resultRelease: 'immediate',
        showExplanations: true,
        leaderboardEnabled: true,
        subjectiveGrading: 'none',
        ...overrides,
      },
    });
    if (created.status !== 201) throw new Error(JSON.stringify(created.body));
    const id = created.body.id as string;
    await call(ctx, 'PUT', `/admin/assessments/${id}/structure`, {
      token: admin,
      body: { sections: [{ pickMode: 'fixed', questions: [{ questionId: question }] }] },
    });
    await call(ctx, 'PUT', `/admin/assessments/${id}/publishing`, {
      token: admin,
      body: { status: 'published' },
    });
    return id;
  };
  const challenge = (day: string) =>
    assessment({ type: 'daily_challenge', title: { en: `Challenge ${day}` }, challengeDate: day });
  const take = async (token: string, id: string, value: boolean) => {
    const started = await call(ctx, 'POST', `/assessments/${id}/attempts`, { token });
    if (started.status !== 200) return started;
    await call(ctx, 'PUT', `/attempts/${started.body.id}/answers`, {
      token,
      body: {
        answers: [{ questionId: question, response: { type: 'true_false', value }, markedForReview: false }],
      },
    });
    return call(ctx, 'POST', `/attempts/${started.body.id}/submit`, { token });
  };
  const student = async (email: string, fullName: string) => {
    const token = (await registerStudent(ctx, email)).accessToken;
    const user = await ctx.prisma.user.update({ where: { email }, data: { fullName } });
    return { token, id: user.id };
  };
  return { admin, assessment, challenge, take, student };
}

describe('daily challenge and streaks (D-049)', () => {
  it('counts a challenge submitted on its day; past ones are practice; future ones wait', async () => {
    const s = await setup();
    const todays = await s.challenge(today());
    const yesterdays = await s.challenge(dayOffset(-1));
    const tomorrows = await s.challenge(dayOffset(1));
    const asha = await s.student('asha@example.com', 'Asha Rai');

    const before = (await call(ctx, 'GET', '/daily-challenge/today', { token: asha.token })).body;
    expect(before).toMatchObject({
      today: today(),
      challenge: { id: todays, challengeDate: today(), locked: false },
      streak: { current: 0, longest: 0, doneToday: false },
    });

    // Yesterday counted already (4 days in a row): today's challenge makes it 5.
    await ctx.prisma.userStreak.create({
      data: {
        userId: asha.id,
        currentDays: 4,
        longestDays: 4,
        lastDay: new Date(`${dayOffset(-1)}T00:00:00Z`),
      },
    });
    expect((await s.take(asha.token, todays, true)).status).toBe(200);
    expect((await call(ctx, 'GET', '/me/streak', { token: asha.token })).body).toEqual({
      current: 5,
      longest: 5,
      doneToday: true,
    });
    // Taking it again the same day changes nothing.
    await s.take(asha.token, todays, true);
    expect((await call(ctx, 'GET', '/me/streak', { token: asha.token })).body.current).toBe(5);

    // Yesterday's challenge is practice: it does not touch the streak.
    const practice = await s.take(asha.token, yesterdays, true);
    expect(practice.body.practice).toBe(true);
    expect((await call(ctx, 'GET', '/me/streak', { token: asha.token })).body.current).toBe(5);
    const past = (await call(ctx, 'GET', '/daily-challenges', { token: asha.token })).body;
    expect(past.pastAsPractice).toBe(true);
    expect(past.data.map((c: { id: string }) => c.id)).toEqual([yesterdays]);

    expect(
      (await call(ctx, 'POST', `/assessments/${tomorrows}/attempts`, { token: asha.token })).body.error,
    ).toMatchObject({
      code: 'ASSESSMENT_NOT_AVAILABLE',
      details: { reason: 'not_open' },
    });
    // Practice never extends a streak, even where it would have been the next day.
    const gita = await s.student('gita@example.com', 'Gita Karki');
    await ctx.prisma.userStreak.create({
      data: {
        userId: gita.id,
        currentDays: 3,
        longestDays: 3,
        lastDay: new Date(`${dayOffset(-2)}T00:00:00Z`),
      },
    });
    await s.take(gita.token, yesterdays, true);
    const gitaStreak = await ctx.prisma.userStreak.findUniqueOrThrow({ where: { userId: gita.id } });
    expect(gitaStreak).toMatchObject({ currentDays: 3, longestDays: 3 });
    await setSetting(ctx, 'dailyChallenge.rules', { pastAsPractice: false });
    const ram = await s.student('ram@example.com', 'Ram Thapa');
    expect(
      (await call(ctx, 'POST', `/assessments/${yesterdays}/attempts`, { token: ram.token })).body.error
        .details.reason,
    ).toBe('closed');
  });

  it('lets a streak lapse after a missed day and erases it with the account', async () => {
    const s = await setup();
    const asha = await s.student('asha@example.com', 'Asha Rai');
    await ctx.prisma.userStreak.create({
      data: {
        userId: asha.id,
        currentDays: 7,
        longestDays: 9,
        lastDay: new Date(`${dayOffset(-2)}T00:00:00Z`),
      },
    });
    expect((await call(ctx, 'GET', '/me/streak', { token: asha.token })).body).toEqual({
      current: 0,
      longest: 9,
      doneToday: false,
    });
    await s.take(asha.token, await s.challenge(today()), true);
    expect((await call(ctx, 'GET', '/me/streak', { token: asha.token })).body).toMatchObject({
      current: 1,
      longest: 9,
    });

    await call(ctx, 'POST', '/me/deletion', { token: asha.token });
    await ctx.app.get(AccountDeletionService).processDue(new Date(Date.now() + 60 * DAY));
    expect(await ctx.prisma.userStreak.count()).toBe(0);
  });
});

describe('leaderboards (D-048, D-049)', () => {
  it('ranks official attempts by score then time, shares tied ranks and shows names per the CMS setting', async () => {
    const s = await setup();
    const id = await s.assessment({ countedAttempt: 'first' });
    const people = [
      await s.student('asha@example.com', 'Asha Rai'),
      await s.student('ram@example.com', 'Ram Thapa'),
      await s.student('sita@example.com', 'Sita Karki'),
      await s.student('hari@example.com', 'Hari Sharma'),
    ];
    const [asha, ram, sita, hari] = people as [
      (typeof people)[0],
      (typeof people)[0],
      (typeof people)[0],
      (typeof people)[0],
    ];
    const attempt = async (who: typeof asha, value: boolean, seconds: number) => {
      const result = (await s.take(who.token, id, value)).body;
      await ctx.prisma.attempt.update({ where: { id: result.id }, data: { timeTakenSeconds: seconds } });
      return result.id as string;
    };
    const ashaAttempt = await attempt(asha, true, 60);
    await attempt(ram, true, 60);
    await attempt(sita, true, 30);
    await attempt(hari, false, 10);
    await attempt(hari, true, 5); // a retake: only the first (official) attempt counts

    const board = (await call(ctx, 'GET', `/assessments/${id}/leaderboard`, { token: asha.token })).body;
    expect(board).toMatchObject({
      released: true,
      total: 4,
      names: 'first_initial',
      me: { rank: 2, score: 100 },
    });
    expect(
      board.top.map((e: { rank: number; name: string | null; me: boolean }) => [e.rank, e.name, e.me]),
    ).toEqual([
      [1, 'Sita K.', false],
      [2, null, true],
      [2, 'Ram T.', false],
      [4, 'Hari S.', false],
    ]);
    expect(JSON.stringify(board)).not.toContain('Karki');

    expect(
      (await call(ctx, 'GET', `/attempts/${ashaAttempt}/result`, { token: asha.token })).body.rank,
    ).toEqual({
      rank: 2,
      total: 4,
    });

    await setSetting(ctx, 'leaderboards.display', { names: 'full' });
    const full = (await call(ctx, 'GET', `/assessments/${id}/leaderboard`, { token: asha.token })).body;
    expect(full.top[0].name).toBe('Sita Karki');
    await setSetting(ctx, 'leaderboards.display', { names: 'none' });
    const none = (await call(ctx, 'GET', `/assessments/${id}/leaderboard`, { token: asha.token })).body;
    expect(none).toMatchObject({ top: [], me: { rank: 2 }, total: 4 });
  });

  it('hides ranks until results are released, excludes practice, and 404s without a leaderboard', async () => {
    const s = await setup();
    const asha = await s.student('asha@example.com', 'Asha Rai');
    const manual = await s.assessment({ resultRelease: 'manual' });
    const hidden = (await s.take(asha.token, manual, true)).body;
    expect(hidden.rank).toBeNull();
    expect(
      (await call(ctx, 'GET', `/assessments/${manual}/leaderboard`, { token: asha.token })).body,
    ).toMatchObject({
      released: false,
      top: [],
      me: null,
    });

    const off = await s.assessment({ leaderboardEnabled: false });
    expect((await call(ctx, 'GET', `/assessments/${off}/leaderboard`, { token: asha.token })).status).toBe(
      404,
    );

    // Yesterday's challenge taken today is practice: not on that day's leaderboard.
    const yesterdays = await s.challenge(dayOffset(-1));
    await s.take(asha.token, yesterdays, true);
    const board = (await call(ctx, 'GET', `/assessments/${yesterdays}/leaderboard`, { token: asha.token }))
      .body;
    expect(board).toMatchObject({ released: true, total: 0, me: null, top: [] });
  });
});
