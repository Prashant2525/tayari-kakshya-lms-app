import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { publisher, seedPublishedCourse } from './content-helpers.js';
import { call, createTestApp, registerStudent, type TestContext } from './helpers.js';

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

async function setup() {
  const admin = await publisher(ctx);
  const seeded = await seedPublishedCourse(ctx, admin);
  const student = (await registerStudent(ctx, 'student@example.com')).accessToken;
  const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'student@example.com' } });
  return { admin, seeded, student, userId: user.id };
}

const progress = (token: string, itemId: string, body: unknown) =>
  call(ctx, 'PUT', `/learning-items/${itemId}/progress`, { token, body });

describe('learning progress', () => {
  it('saves positions, keeps completion, and shows both in the subject outline', async () => {
    const { seeded, student } = await setup();
    const video = seeded.freeVideo.id as string;
    let res = await progress(student, video, { courseId: seeded.course.id, position: 95 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ position: 95, completed: false });
    res = await progress(student, video, { position: 200, completed: true });
    expect(res.body).toEqual({ position: 200, completed: true });
    // Finishing is permanent: a later position update does not undo it.
    res = await progress(student, video, { position: 10 });
    expect(res.body).toEqual({ position: 10, completed: true });

    const outline = await call(
      ctx,
      'GET',
      `/courses/${seeded.course.id}/subjects/${seeded.subject.id}/outline`,
      { token: student },
    );
    const items = outline.body.chapters[0].topics[0].items as Array<{ id: string; progress: unknown }>;
    expect(items.find((i) => i.id === video)?.progress).toEqual({ position: 10, completed: true });
    expect(items.find((i) => i.id === seeded.freeNote.id)?.progress).toBeNull();
  });

  it('applies the same access rules as opening the item', async () => {
    const { seeded, student } = await setup();
    const locked = await progress(student, seeded.premiumNote.id, { completed: true });
    expect(locked.status).toBe(403);
    expect(locked.body.error.code).toBe('CONTENT_LOCKED');
    expect(await ctx.prisma.learningProgress.count()).toBe(0);
    expect((await progress(student, seeded.freeNote.id, {})).status).toBe(400);
    expect((await progress(student, seeded.freeNote.id, { completed: false })).status).toBe(400);
    expect((await progress(student, seeded.freeNote.id, { position: -1 })).status).toBe(400);
    const wrongCourse = await progress(student, seeded.freeNote.id, {
      courseId: '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b',
      position: 1,
    });
    expect(wrongCourse.status).toBe(400);
    expect(JSON.stringify(wrongCourse.body)).toContain('not part of that course');
    expect(
      (await call(ctx, 'PUT', `/learning-items/${seeded.freeNote.id}/progress`, { body: {} })).status,
    ).toBe(401);
  });

  it('continues with the last unfinished item, in the course it was opened from', async () => {
    const { seeded, student } = await setup();
    expect((await call(ctx, 'GET', '/me/continue', { token: student })).body).toEqual({ next: null });
    await progress(student, seeded.freeNote.id, { courseId: seeded.course.id, position: 0 });
    await progress(student, seeded.freeVideo.id, { courseId: seeded.course.id, position: 30 });
    let next = (await call(ctx, 'GET', '/me/continue', { token: student })).body.next;
    expect(next).toMatchObject({
      item: { id: seeded.freeVideo.id, type: 'video', position: 30, durationSeconds: 212 },
      subject: { id: seeded.subject.id, name: { en: 'English' } },
      course: { id: seeded.course.id, slug: 'sainey-likhit' },
    });
    // Finished items are skipped.
    await progress(student, seeded.freeVideo.id, { completed: true });
    next = (await call(ctx, 'GET', '/me/continue', { token: student })).body.next;
    expect(next.item.id).toBe(seeded.freeNote.id);
  });

  it('skips items that can no longer be opened', async () => {
    const { admin, seeded, student } = await setup();
    await progress(student, seeded.freeNote.id, { position: 0 });
    await call(ctx, 'PUT', `/admin/learning-items/${seeded.freeNote.id}/publishing`, {
      token: admin,
      body: { status: 'draft' },
    });
    expect((await call(ctx, 'GET', '/me/continue', { token: student })).body).toEqual({ next: null });
  });

  it('reports finished / total items for each of my courses', async () => {
    const { admin, seeded, student, userId } = await setup();
    await call(ctx, 'POST', `/admin/users/${userId}/entitlements`, {
      token: admin,
      body: { courseId: seeded.course.id, endsAt: null },
    });
    await progress(student, seeded.freeVideo.id, { completed: true });
    await progress(student, seeded.premiumNote.id, { completed: true });
    const mine = await call(ctx, 'GET', '/me/courses', { token: student });
    expect(mine.body[0]).toMatchObject({ id: seeded.course.id, progress: { completed: 2, total: 4 } });
  });
});

describe('PDF reader page (T-038)', () => {
  it('serves the self-hosted reader with a strict policy and only allow-listed files', async () => {
    const page = await call(ctx, 'GET', '/viewer/pdf');
    expect(page.status).toBe(200);
    expect(String(page.headers['content-type'])).toContain('text/html');
    const csp = String(page.headers['content-security-policy']);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).toContain('frame-ancestors');
    expect(page.headers['x-frame-options']).toBeUndefined();
    expect(String(page.body)).toContain('assets/viewer.mjs');

    const lib = await call(ctx, 'GET', '/viewer/assets/pdf.min.mjs');
    expect(lib.status).toBe(200);
    expect(String(lib.headers['content-type'])).toContain('text/javascript');
    expect((await call(ctx, 'GET', '/viewer/assets/viewer.mjs')).status).toBe(200);
    expect((await call(ctx, 'GET', '/viewer/assets/wasm/openjpeg.wasm')).status).toBe(200);

    for (const path of [
      '/viewer/assets/package.json',
      '/viewer/assets/build/pdf.mjs',
      '/viewer/assets/cmaps/..%2F..%2Fpackage.json',
      '/viewer/assets/web/viewer.html',
      '/viewer/assets/cmaps/.hidden',
    ]) {
      expect((await call(ctx, 'GET', path)).status, path).toBe(404);
    }
  });
});
