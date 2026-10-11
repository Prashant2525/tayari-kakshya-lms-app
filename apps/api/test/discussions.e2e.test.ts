import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountDeletionService } from '../src/modules/auth/account-deletion.service.js';
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
type Post = {
  id: string;
  body: string;
  author: string;
  staff: boolean;
  mine: boolean;
  best: boolean;
  deleted: boolean;
  replies: Post[];
};

async function setup() {
  const admin = await publisher(ctx);
  const seeded = await seedPublishedCourse(ctx, admin);
  await createStaff(ctx, 'teacher@example.com', { permissions: ['discussions:moderate'] });
  const teacher = (await staffLogin(ctx, 'teacher@example.com')).token;
  const student = async (email: string, fullName: string) => {
    const token = (await registerStudent(ctx, email)).accessToken;
    const user = await ctx.prisma.user.update({ where: { email }, data: { fullName } });
    return { token, id: user.id };
  };
  const grant = async (userId: string) => {
    const res = await call(ctx, 'POST', `/admin/users/${userId}/entitlements`, {
      token: admin,
      body: { courseId: seeded.course.id, endsAt: null },
    });
    expect(res.status).toBe(201);
  };
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
  const thread = (token: string, target: string, id: string) =>
    call(ctx, 'GET', `/discussions/${target}/${id}`, { token });
  const say = (token: string, target: string, id: string, body: unknown) =>
    call(ctx, 'POST', `/discussions/${target}/${id}/posts`, { token, body });
  return { admin, seeded, teacher, student, grant, single, question, thread, say };
}

describe('discussions under lessons (S12, D-066)', () => {
  it('lets students ask and answer, staff answer, mark the best answer and moderate', async () => {
    const s = await setup();
    const asha = await s.student('asha@example.com', 'Asha Rai');
    const bina = await s.student('bina@example.com', 'Bina Gurung');
    const lesson = s.seeded.freeNote.id;

    // A premium lesson's discussion needs the course; a free lesson's is open to students.
    expect((await s.thread(asha.token, 'lesson', s.seeded.premiumNote.id)).status).toBe(403);
    await s.grant(asha.id);
    expect((await s.thread(asha.token, 'lesson', s.seeded.premiumNote.id)).status).toBe(200);
    expect((await s.thread(asha.token, 'nothing', lesson)).status).toBe(404);
    expect((await s.thread(asha.token, 'lesson', '00000000-0000-7000-8000-000000000000')).status).toBe(404);
    expect((await s.thread(s.teacher, 'lesson', lesson)).status).toBe(403);

    // Posts are checked, then shown at once.
    expect((await s.say(asha.token, 'lesson', lesson, { body: 'x' })).status).toBe(400);
    expect((await s.say(asha.token, 'lesson', lesson, { body: 'x'.repeat(2001) })).status).toBe(400);
    const doubt = await s.say(asha.token, 'lesson', lesson, { body: '  Why is "an" used before "hour"?  ' });
    expect(doubt.status).toBe(201);
    expect(doubt.body).toMatchObject({
      body: 'Why is "an" used before "hour"?',
      author: 'Asha R.',
      staff: false,
      mine: true,
    });
    let t = await s.thread(bina.token, 'lesson', lesson);
    expect(t.body).toMatchObject({ count: 1, canPost: true, bannedUntil: null });
    expect(t.body.data[0]).toMatchObject({ id: doubt.body.id, mine: false, replies: [] });

    // A student replies; the asker is told (push and in-app, never email).
    const reply = await s.say(bina.token, 'lesson', lesson, {
      body: 'Because "hour" starts with a vowel sound.',
      parentId: doubt.body.id,
    });
    expect(reply.status).toBe(201);
    const told = await ctx.prisma.notification.findFirstOrThrow({
      where: { userId: asha.id, category: 'discussion' },
    });
    expect(told).toMatchObject({ link: { type: 'discussion', target: 'lesson', id: lesson } });
    expect(
      await ctx.prisma.notificationDelivery.count({ where: { userId: asha.id, channel: 'email' } }),
    ).toBe(0);
    // Replies are one level deep and stay in their own thread.
    expect(
      (await s.say(asha.token, 'lesson', lesson, { body: 'Nested', parentId: reply.body.id })).status,
    ).toBe(400);
    expect(
      (
        await s.say(asha.token, 'lesson', s.seeded.freeVideo.id, {
          body: 'Elsewhere',
          parentId: doubt.body.id,
        })
      ).status,
    ).toBe(400);

    // A teacher answers from the CMS (badged) and marks the best answer — one per doubt.
    expect((await call(ctx, 'GET', '/admin/discussions', { token: s.admin })).status).toBe(403);
    const answer = await call(ctx, 'POST', `/admin/discussions/lesson/${lesson}/posts`, {
      token: s.teacher,
      body: { body: 'Use "an" before a vowel sound, not a vowel letter.', parentId: doubt.body.id },
    });
    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({ staff: true, author: 'Staff teacher@example.com' });
    expect(
      (await call(ctx, 'PUT', `/admin/discussions/posts/${doubt.body.id}/best`, { token: s.teacher })).status,
    ).toBe(400);
    await call(ctx, 'PUT', `/admin/discussions/posts/${reply.body.id}/best`, { token: s.teacher });
    await call(ctx, 'PUT', `/admin/discussions/posts/${answer.body.id}/best`, { token: s.teacher });
    t = await s.thread(asha.token, 'lesson', lesson);
    expect((t.body.data[0].replies as Post[]).map((r) => [r.staff, r.best])).toEqual([
      [false, false],
      [true, true],
    ]);

    // Reports: not one's own; staff see reported posts and hide them (the doubt and its replies go).
    expect(
      (
        await call(ctx, 'POST', `/discussions/posts/${doubt.body.id}/report`, {
          token: asha.token,
          body: { reason: 'spam' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(ctx, 'POST', `/discussions/posts/${doubt.body.id}/report`, {
          token: bina.token,
          body: { reason: 'rude', message: 'Not nice' },
        })
      ).status,
    ).toBe(204);
    let reported = await call(ctx, 'GET', '/admin/discussions?view=reported', { token: s.teacher });
    expect(reported.body.data).toEqual([
      expect.objectContaining({
        id: doubt.body.id,
        target: 'lesson',
        context: { title: 'Intro', subject: { en: 'English', ne: 'अंग्रेजी' } },
        reports: [{ reason: 'rude', message: 'Not nice' }],
        author: expect.objectContaining({ name: 'Asha Rai', email: 'asha@example.com', staff: false }),
      }),
    ]);
    expect(
      (
        await call(ctx, 'POST', `/admin/discussions/posts/${doubt.body.id}/hide`, {
          token: s.teacher,
          body: { reason: 'x' },
        })
      ).status,
    ).toBe(400);
    await call(ctx, 'POST', `/admin/discussions/posts/${doubt.body.id}/hide`, {
      token: s.teacher,
      body: { reason: 'Off topic' },
    });
    expect((await s.thread(bina.token, 'lesson', lesson)).body).toMatchObject({ data: [], count: 2 });
    reported = await call(ctx, 'GET', '/admin/discussions?view=reported', { token: s.teacher });
    expect(reported.body.data).toEqual([]);
    const hidden = await call(ctx, 'GET', '/admin/discussions?view=hidden', { token: s.teacher });
    expect(hidden.body.data[0]).toMatchObject({
      id: doubt.body.id,
      hiddenReason: 'Off topic',
      hiddenBy: 'Staff teacher@example.com',
    });
    // Staff still see the whole thread, hidden posts marked.
    const staffView = await call(ctx, 'GET', `/admin/discussions/lesson/${lesson}`, { token: s.teacher });
    expect(staffView.body.data[0]).toMatchObject({ id: doubt.body.id, status: 'hidden' });
    await call(ctx, 'POST', `/admin/discussions/posts/${doubt.body.id}/unhide`, { token: s.teacher });
    expect((await s.thread(bina.token, 'lesson', lesson)).body.data).toHaveLength(1);
    // Reports can also be dismissed (the post stays).
    await call(ctx, 'POST', `/discussions/posts/${reply.body.id}/report`, {
      token: asha.token,
      body: { reason: 'wrong' },
    });
    expect(
      (
        await call(ctx, 'POST', `/admin/discussions/posts/${reply.body.id}/dismiss-reports`, {
          token: s.teacher,
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await call(ctx, 'POST', `/admin/discussions/posts/${reply.body.id}/dismiss-reports`, {
          token: s.teacher,
        })
      ).status,
    ).toBe(404);

    // Staff stop a student posting (until a time, or with no end); reading still works.
    expect(
      (
        await call(ctx, 'PUT', `/admin/discussions/bans/${bina.id}`, {
          token: s.teacher,
          body: { until: new Date(Date.now() - DAY).toISOString(), reason: 'Spam links' },
        })
      ).status,
    ).toBe(400);
    const until = new Date(Date.now() + 7 * DAY).toISOString();
    await call(ctx, 'PUT', `/admin/discussions/bans/${bina.id}`, {
      token: s.teacher,
      body: { until, reason: 'Spam links' },
    });
    expect((await s.say(bina.token, 'lesson', lesson, { body: 'Hello again' })).status).toBe(403);
    expect((await s.thread(bina.token, 'lesson', lesson)).body).toMatchObject({
      canPost: false,
      bannedUntil: until,
    });
    const staffUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'teacher@example.com' } });
    expect(
      (
        await call(ctx, 'PUT', `/admin/discussions/bans/${staffUser.id}`, {
          token: s.teacher,
          body: { until: null, reason: 'Not a student' },
        })
      ).status,
    ).toBe(404);
    await call(ctx, 'DELETE', `/admin/discussions/bans/${bina.id}`, { token: s.teacher });
    expect(
      (await s.say(bina.token, 'lesson', lesson, { body: 'Thank you!', parentId: doubt.body.id })).status,
    ).toBe(201);

    // Deleting: a reply goes; a doubt with replies stays as an empty placeholder.
    expect(
      (await call(ctx, 'DELETE', `/discussions/posts/${reply.body.id}`, { token: asha.token })).status,
    ).toBe(404);
    expect(
      (await call(ctx, 'DELETE', `/discussions/posts/${reply.body.id}`, { token: bina.token })).status,
    ).toBe(204);
    expect(
      (await call(ctx, 'DELETE', `/discussions/posts/${doubt.body.id}`, { token: asha.token })).status,
    ).toBe(204);
    t = await s.thread(bina.token, 'lesson', lesson);
    expect(t.body.data[0]).toMatchObject({ deleted: true, body: '', author: '' });
    expect((t.body.data[0].replies as Post[]).map((r) => r.body)).toEqual([
      'Use "an" before a vowel sound, not a vowel letter.',
      'Thank you!',
    ]);

    // Staff actions are audited: teacher post, best ×2, hide, unhide, dismiss, ban, unban (refused ones are not).
    expect(await ctx.prisma.auditLog.count({ where: { action: { startsWith: 'discussion.' } } })).toBe(8);

    // Erasing an account empties its posts.
    await call(ctx, 'POST', '/me/deletion', { token: bina.token });
    await ctx.app.get(AccountDeletionService).processDue(new Date(Date.now() + 60 * DAY));
    const left = await ctx.prisma.discussionPost.findMany({ where: { userId: bina.id } });
    expect(left.map((p) => [p.status, p.body])).toEqual([['deleted', '']]);
  });
});

describe('discussions under questions', () => {
  it('opens only after the student has seen and answered the question', async () => {
    const s = await setup();
    const asha = await s.student('asha@example.com', 'Asha Rai');
    const free = await s.single();
    const premium = await s.single('premium');
    const essay = await s.question({
      type: 'subjective',
      stem: doc('Explain federalism.'),
      modelAnswer: doc('Power is shared.'),
    });

    // Not answered yet: closed (the discussion could give the answer away).
    let res = await s.thread(asha.token, 'question', free);
    expect(res.status).toBe(403);
    await call(ctx, 'POST', `/practice-questions/${free}/check`, {
      token: asha.token,
      body: { response: { type: 'single_choice', optionId: 'a' } },
    });
    expect((await s.thread(asha.token, 'question', free)).status).toBe(200);
    // Written answers are self-marked: their discussion opens with the model answer.
    expect((await s.thread(asha.token, 'question', essay)).status).toBe(200);
    // Premium: needs the course (then answering as usual).
    expect((await s.thread(asha.token, 'question', premium)).status).toBe(403);
    await s.grant(asha.id);
    expect((await s.thread(asha.token, 'question', premium)).status).toBe(403);
    await call(ctx, 'POST', `/practice-questions/${premium}/check`, {
      token: asha.token,
      body: { response: { type: 'single_choice', optionId: 'b' } },
    });
    expect((await s.thread(asha.token, 'question', premium)).status).toBe(200);

    // From a test: only once its results are out.
    const bina = await s.student('bina@example.com', 'Bina Gurung');
    const fresh = await s.single();
    const quiz = await call(ctx, 'POST', '/admin/assessments', {
      token: s.admin,
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
        resultRelease: 'manual',
        showExplanations: true,
        leaderboardEnabled: false,
        subjectiveGrading: 'none',
      },
    });
    await call(ctx, 'PUT', `/admin/assessments/${quiz.body.id}/structure`, {
      token: s.admin,
      body: { sections: [{ pickMode: 'fixed', questions: [{ questionId: fresh }] }] },
    });
    await call(ctx, 'PUT', `/admin/assessments/${quiz.body.id}/publishing`, {
      token: s.admin,
      body: { status: 'published' },
    });
    const started = await call(ctx, 'POST', `/assessments/${quiz.body.id}/attempts`, { token: bina.token });
    await call(ctx, 'PUT', `/attempts/${started.body.id}/answers`, {
      token: bina.token,
      body: {
        answers: [
          { questionId: fresh, response: { type: 'single_choice', optionId: 'b' }, markedForReview: false },
        ],
      },
    });
    await call(ctx, 'POST', `/attempts/${started.body.id}/submit`, { token: bina.token });
    expect((await s.thread(bina.token, 'question', fresh)).status).toBe(403);
    await call(ctx, 'POST', `/admin/assessments/${quiz.body.id}/release-results`, { token: s.admin });
    expect((await s.thread(bina.token, 'question', fresh)).status).toBe(200);
    res = await s.say(bina.token, 'question', fresh, { body: 'Is Kathmandu also the largest city?' });
    expect(res.status).toBe(201);
    // The CMS shows the question it is about.
    const recent = await call(ctx, 'GET', '/admin/discussions?view=recent', { token: s.teacher });
    expect(recent.body.data[0]).toMatchObject({
      target: 'question',
      context: { title: 'Capital of Nepal?' },
    });
  });
});
