import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountDeletionService } from '../src/modules/auth/account-deletion.service.js';
import { note, publisher, seedPublishedCourse } from './content-helpers.js';
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

async function setup() {
  const admin = await publisher(ctx);
  const seeded = await seedPublishedCourse(ctx, admin);
  const question = async (
    accessLevel: 'free' | 'premium',
    content: Record<string, unknown>,
    publish = true,
  ) => {
    const res = await call(ctx, 'POST', '/admin/questions', {
      token: admin,
      body: {
        subjectId: seeded.subject.id,
        topicId: seeded.topic.id,
        difficulty: 'easy',
        defaultMarks: 2,
        accessLevel,
        tags: [],
        content,
      },
    });
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    if (publish) {
      await call(ctx, 'PUT', `/admin/questions/${res.body.id}/status`, {
        token: admin,
        body: { status: 'published' },
      });
    }
    return res.body.id as string;
  };
  const freeMcq = await question('free', {
    type: 'single_choice',
    stem: doc('Which article guarantees equality?'),
    options: [
      { id: 'a', content: doc('Article 16') },
      { id: 'b', content: doc('Article 18') },
    ],
    correctOptionId: 'b',
    explanation: doc('Article 18 is the right to equality.'),
  });
  const premiumSubjective = await question('premium', {
    type: 'subjective',
    stem: doc('Explain the right to constitutional remedy.'),
    modelAnswer: doc('SECRET MODEL ANSWER about Article 46'),
  });
  const draft = await question(
    'free',
    { type: 'true_false', stem: doc('Draft statement'), correct: true },
    false,
  );
  const student = (await registerStudent(ctx, 'student@example.com')).accessToken;
  const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'student@example.com' } });
  return { admin, seeded, student, userId: user.id, freeMcq, premiumSubjective, draft };
}

const listUrl = (s: Awaited<ReturnType<typeof setup>>, extra = '') =>
  `/courses/${s.seeded.course.id}/subjects/${s.seeded.subject.id}/questions${extra}`;

describe('practice questions', () => {
  it('sends answers for free questions and never for locked premium ones', async () => {
    const s = await setup();
    const res = await call(ctx, 'GET', listUrl(s), { token: s.student });
    expect(res.status).toBe(200);
    expect(res.body.data.map((q: { id: string }) => q.id)).toEqual([s.freeMcq, s.premiumSubjective]);
    const [free, premium] = res.body.data;
    expect(free).toMatchObject({
      locked: false,
      marks: 2,
      question: { type: 'single_choice', options: [{ id: 'a' }, { id: 'b' }] },
      answer: { type: 'single_choice', correctOptionId: 'b' },
    });
    expect(free.question).not.toHaveProperty('correctOptionId');
    expect(premium).toMatchObject({ locked: true, answer: null, question: { type: 'subjective' } });
    expect(premium.question).not.toHaveProperty('modelAnswer');
    // Rule 5: the locked model answer is nowhere in the response.
    expect(JSON.stringify(res.body)).not.toContain('SECRET MODEL ANSWER');

    await call(ctx, 'POST', `/admin/users/${s.userId}/entitlements`, {
      token: s.admin,
      body: { courseId: s.seeded.course.id, endsAt: null },
    });
    const unlocked = await call(ctx, 'GET', listUrl(s), { token: s.student });
    expect(unlocked.body.data[1]).toMatchObject({ locked: false, answer: { type: 'subjective' } });
    expect(JSON.stringify(unlocked.body)).toContain('SECRET MODEL ANSWER');
  });

  it('pages, filters by chapter or topic, and respects course, publishing and verification rules', async () => {
    const s = await setup();
    const first = await call(ctx, 'GET', listUrl(s, '?limit=1'), { token: s.student });
    expect(first.body.data).toHaveLength(1);
    const second = await call(ctx, 'GET', listUrl(s, `?limit=1&cursor=${first.body.nextCursor}`), {
      token: s.student,
    });
    expect(second.body.data[0].id).toBe(s.premiumSubjective);
    expect(second.body.nextCursor).toBeNull();
    expect(
      (await call(ctx, 'GET', listUrl(s, `?topicId=${s.seeded.topic.id}`), { token: s.student })).body.data,
    ).toHaveLength(2);
    expect(
      (await call(ctx, 'GET', listUrl(s, `?chapterId=${s.seeded.chapter.id}`), { token: s.student })).body
        .data,
    ).toHaveLength(2);

    const otherCourse = `/courses/0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b/subjects/${s.seeded.subject.id}/questions`;
    expect((await call(ctx, 'GET', otherCourse, { token: s.student })).status).toBe(404);
    expect((await call(ctx, 'GET', `/practice-questions/${s.draft}`, { token: s.student })).status).toBe(404);

    await setSetting(ctx, 'auth.verification', {
      channels: { email: true, phone: false },
      requiredForLearning: true,
    });
    const unverified = await call(ctx, 'GET', listUrl(s), { token: s.student });
    expect(unverified.status).toBe(403);
    expect(unverified.body.error.code).toBe('VERIFICATION_REQUIRED');
  });

  it('opens a single question with the same lock rule', async () => {
    const s = await setup();
    const locked = await call(ctx, 'GET', `/practice-questions/${s.premiumSubjective}`, { token: s.student });
    expect(locked.body).toMatchObject({ locked: true, answer: null });
    expect(JSON.stringify(locked.body)).not.toContain('SECRET MODEL ANSWER');
    const free = await call(ctx, 'GET', `/practice-questions/${s.freeMcq}`, { token: s.student });
    expect(free.body.answer).toMatchObject({ correctOptionId: 'b' });
  });
});

describe('bookmarks', () => {
  it('saves lessons and questions, lists newest first, and drops unpublished ones', async () => {
    const s = await setup();
    const put = (type: string, id: string) =>
      call(ctx, 'PUT', `/me/bookmarks/${type}/${id}`, { token: s.student });
    expect((await put('learning_item', s.seeded.freeNote.id)).status).toBe(204);
    expect((await put('question', s.premiumSubjective)).status).toBe(204);
    expect((await put('question', s.premiumSubjective)).status).toBe(204); // idempotent
    expect((await put('question', s.draft)).status).toBe(404);
    expect((await put('course', s.freeMcq)).status).toBe(400);

    let list = (await call(ctx, 'GET', '/me/bookmarks', { token: s.student })).body;
    expect(list).toEqual([
      expect.objectContaining({
        targetType: 'question',
        id: s.premiumSubjective,
        preview: 'Explain the right to constitutional remedy.',
        subject: expect.objectContaining({ name: { en: 'English', ne: 'अंग्रेजी' } }),
      }),
      expect.objectContaining({
        targetType: 'learning_item',
        id: s.seeded.freeNote.id,
        itemType: 'note',
        title: { en: 'Intro' },
      }),
    ]);

    await call(ctx, 'PUT', `/admin/learning-items/${s.seeded.freeNote.id}/publishing`, {
      token: s.admin,
      body: { status: 'draft' },
    });
    list = (await call(ctx, 'GET', '/me/bookmarks', { token: s.student })).body;
    expect(list.map((b: { id: string }) => b.id)).toEqual([s.premiumSubjective]);

    expect(
      (await call(ctx, 'DELETE', `/me/bookmarks/question/${s.premiumSubjective}`, { token: s.student }))
        .status,
    ).toBe(204);
    expect((await call(ctx, 'GET', '/me/bookmarks', { token: s.student })).body).toEqual([]);
  });

  it('are removed when the account is erased (D-032)', async () => {
    const s = await setup();
    await call(ctx, 'PUT', `/me/bookmarks/question/${s.freeMcq}`, { token: s.student });
    await call(ctx, 'POST', '/me/deletion', { token: s.student });
    await ctx.app.get(AccountDeletionService).processDue(new Date(Date.now() + 60 * 86_400_000));
    expect(await ctx.prisma.bookmark.count()).toBe(0);
  });
});

describe('search', () => {
  it('finds courses, lessons and questions without leaking locked answers', async () => {
    const s = await setup();
    const res = await call(ctx, 'GET', '/search?q=sainey', { token: s.student });
    expect(res.body.courses.map((c: { slug: string }) => c.slug)).toEqual(['sainey-likhit']);
    // A lesson still in draft is never found (it was, through a filter that dropped the "live" rule).
    const draftLesson = await call(ctx, 'POST', `/admin/topics/${s.seeded.topic.id}/items`, {
      token: s.admin,
      body: {
        type: 'note',
        title: { en: 'Deep dive draft' },
        accessLevel: 'free',
        noteContent: note('Draft'),
      },
    });
    expect(draftLesson.status).toBe(201);
    const lessons = await call(ctx, 'GET', '/search?q=deep%20dive', { token: s.student });
    expect(lessons.body.items).toEqual([
      expect.objectContaining({ id: s.seeded.premiumNote.id, type: 'note', accessLevel: 'premium' }),
    ]);
    expect(JSON.stringify(lessons.body)).not.toContain('Premium secret body');
    const questions = await call(ctx, 'GET', '/search?q=constitutional', { token: s.student });
    expect(questions.body.questions).toEqual([
      expect.objectContaining({
        id: s.premiumSubjective,
        preview: 'Explain the right to constitutional remedy.',
      }),
    ]);
    expect(JSON.stringify(questions.body)).not.toContain('SECRET MODEL ANSWER');
    expect(
      (await call(ctx, 'GET', '/search?q=Draft%20statement', { token: s.student })).body.questions,
    ).toEqual([]);
    expect((await call(ctx, 'GET', '/search?q=a', { token: s.student })).status).toBe(400);
  });
});
