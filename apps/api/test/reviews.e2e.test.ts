import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountDeletionService } from '../src/modules/auth/account-deletion.service.js';
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
/** The seeded course's address (seedPublishedCourse's default). */
const SLUG = 'sainey-likhit';

async function setup() {
  const admin = await publisher(ctx);
  const seeded = await seedPublishedCourse(ctx, admin);
  // Test value (the business value is CMS data): reviews after half of the lessons.
  await setSetting(ctx, 'reviews.rules', { minProgressPercent: 50, names: 'first_initial' });
  await createStaff(ctx, 'moderator@example.com', { permissions: ['reviews:moderate'] });
  const moderator = (await staffLogin(ctx, 'moderator@example.com')).token;
  const student = async (email: string) => {
    const token = (await registerStudent(ctx, email)).accessToken;
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    await ctx.prisma.user.update({
      where: { id: user.id },
      data: { fullName: `Asha ${email[0]!.toUpperCase()}ai` },
    });
    return { token, id: user.id };
  };
  const grant = async (userId: string) => {
    const res = await call(ctx, 'POST', `/admin/users/${userId}/entitlements`, {
      token: admin,
      body: { courseId: seeded.course.id, endsAt: null },
    });
    expect(res.status).toBe(201);
  };
  const finish = (token: string, itemId: string) =>
    call(ctx, 'PUT', `/learning-items/${itemId}/progress`, { token, body: { completed: true } });
  const review = (token: string, body: unknown) =>
    call(ctx, 'PUT', `/me/courses/${seeded.course.id}/review`, { token, body });
  const publicList = () => call(ctx, 'GET', `/courses/${SLUG}/reviews`);
  const rating = async () =>
    (await call(ctx, 'GET', `/courses/${SLUG}`)).body.rating as {
      average: number;
      count: number;
    } | null;
  return { admin, seeded, moderator, student, grant, finish, review, publicList, rating };
}

describe('course reviews (S4, D-066)', () => {
  it('lets a student with enough progress review; shown only once staff approve it', async () => {
    const s = await setup();
    const asha = await s.student('asha@example.com');

    // Not a course the student has.
    expect(
      (await call(ctx, 'GET', `/me/courses/${s.seeded.course.id}/review`, { token: asha.token })).status,
    ).toBe(404);
    expect((await s.review(asha.token, { rating: 5 })).status).toBe(404);
    await s.grant(asha.id);
    // Not enough of it finished yet (1 of 4 lessons = 25 % < 50 %).
    await s.finish(asha.token, s.seeded.freeNote.id);
    let mine = await call(ctx, 'GET', `/me/courses/${s.seeded.course.id}/review`, { token: asha.token });
    expect(mine.body).toEqual({
      hasCourse: true,
      progressPercent: 25,
      requiredPercent: 50,
      canReview: false,
      review: null,
    });
    let res = await s.review(asha.token, { rating: 5, body: 'Great course' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({
      code: 'REVIEW_NOT_ALLOWED',
      details: { requiredPercent: 50, progressPercent: 25 },
    });
    await s.finish(asha.token, s.seeded.freeVideo.id);

    // Stars 1–5, text up to 2000 characters (empty text is no text).
    for (const body of [
      { rating: 0 },
      { rating: 6 },
      { rating: 4.5 },
      { rating: 5, body: 'x'.repeat(2001) },
      {},
    ]) {
      expect((await s.review(asha.token, body)).status, JSON.stringify(body)).toBe(400);
    }
    res = await s.review(asha.token, { rating: 5, body: '  Clear notes and good practice questions.  ' });
    expect(res.status).toBe(200);
    expect(res.body.review).toMatchObject({
      rating: 5,
      body: 'Clear notes and good practice questions.',
      status: 'pending',
      rejectionReason: null,
    });

    // Waiting: not public, no rating anywhere.
    expect((await s.publicList()).body).toMatchObject({ data: [], summary: { count: 0, average: 0 } });
    expect(await s.rating()).toBeNull();

    // Only moderators see and decide.
    expect((await call(ctx, 'GET', '/admin/reviews', { token: s.admin })).status).toBe(403);
    const queue = await call(ctx, 'GET', '/admin/reviews?status=pending', { token: s.moderator });
    expect(queue.body.data).toEqual([
      expect.objectContaining({
        rating: 5,
        status: 'pending',
        course: expect.objectContaining({ id: s.seeded.course.id }),
        student: expect.objectContaining({ email: 'asha@example.com' }),
      }),
    ]);
    const id = queue.body.data[0].id as string;
    expect((await call(ctx, 'POST', `/admin/reviews/${id}/approve`, { token: s.moderator })).status).toBe(
      200,
    );

    // Approved: public with a short name, and the course shows its rating (detail, list, my courses).
    const list = await s.publicList();
    expect(list.body.data).toEqual([
      expect.objectContaining({
        rating: 5,
        body: 'Clear notes and good practice questions.',
        author: 'Asha A.',
      }),
    ]);
    expect(list.body.summary).toEqual({ average: 5, count: 1, stars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } });
    expect(await s.rating()).toEqual({ average: 5, count: 1 });
    const catalog = await call(ctx, 'GET', '/courses');
    expect(catalog.body.data.find((c: { id: string }) => c.id === s.seeded.course.id).rating).toEqual({
      average: 5,
      count: 1,
    });
    expect((await call(ctx, 'GET', '/me/courses', { token: asha.token })).body[0].rating).toEqual({
      average: 5,
      count: 1,
    });

    // A second review, rejected with a reason: never public; its author sees why.
    const bina = await s.student('bina@example.com');
    await s.grant(bina.id);
    await s.finish(bina.token, s.seeded.freeNote.id);
    await s.finish(bina.token, s.seeded.premiumNote.id);
    await s.review(bina.token, { rating: 2, body: 'Buy my notes at example.com' });
    const binaId = (await ctx.prisma.courseReview.findFirstOrThrow({ where: { userId: bina.id } })).id;
    expect(
      (
        await call(ctx, 'POST', `/admin/reviews/${binaId}/reject`, {
          token: s.moderator,
          body: { reason: 'x' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(ctx, 'POST', `/admin/reviews/${binaId}/reject`, {
          token: s.moderator,
          body: { reason: 'Advertising is not allowed' },
        })
      ).status,
    ).toBe(200);
    mine = await call(ctx, 'GET', `/me/courses/${s.seeded.course.id}/review`, { token: bina.token });
    expect(mine.body.review).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Advertising is not allowed',
    });
    expect(await s.rating()).toEqual({ average: 5, count: 1 });
    // Approving it later counts it: (5 + 2) / 2.
    await call(ctx, 'POST', `/admin/reviews/${binaId}/approve`, { token: s.moderator });
    expect(await s.rating()).toEqual({ average: 3.5, count: 2 });
    expect(
      (
        await call(ctx, 'POST', '/admin/reviews/00000000-0000-7000-8000-000000000000/approve', {
          token: s.moderator,
        })
      ).status,
    ).toBe(404);

    // Changing an approved review sends it back for approval.
    await s.review(asha.token, { rating: 4, body: 'Good, but more videos please.' });
    expect(await s.rating()).toEqual({ average: 2, count: 1 });
    expect((await s.publicList()).body.data.map((r: { author: string }) => r.author)).toEqual(['Asha B.']);

    // Names as the CMS says: none at all.
    await setSetting(ctx, 'reviews.rules', { minProgressPercent: 50, names: 'none' });
    expect((await s.publicList()).body.data[0].author).toBeNull();

    // Every decision is audited.
    expect(await ctx.prisma.auditLog.count({ where: { entityType: 'course_review' } })).toBe(3);

    // Deleting one's own review; erasure removes the rest.
    expect(
      (await call(ctx, 'DELETE', `/me/courses/${s.seeded.course.id}/review`, { token: asha.token })).status,
    ).toBe(204);
    expect(
      (await call(ctx, 'DELETE', `/me/courses/${s.seeded.course.id}/review`, { token: asha.token })).status,
    ).toBe(404);
    await call(ctx, 'POST', '/me/deletion', { token: bina.token });
    await ctx.app.get(AccountDeletionService).processDue(new Date(Date.now() + 60 * DAY));
    expect(await ctx.prisma.courseReview.count()).toBe(0);
    expect(await s.rating()).toBeNull();
  });

  it('does not list reviews of a course that is not live', async () => {
    const s = await setup();
    expect((await call(ctx, 'GET', '/courses/no-such-course/reviews')).status).toBe(404);
    await call(ctx, 'PUT', `/admin/courses/${s.seeded.course.id}/publishing`, {
      token: s.admin,
      body: { status: 'archived' },
    });
    expect((await s.publicList()).status).toBe(404);
  });
});
