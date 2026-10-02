import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

async function setup() {
  const admin = await publisher(ctx);
  const seeded = await seedPublishedCourse(ctx, admin);
  const student = await registerStudent(ctx, 'student@example.com');
  const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'student@example.com' } });
  return { admin, seeded, token: student.accessToken, userId: user.id };
}

async function grant(admin: string, userId: string, courseId: string, endsAt: string | null = null) {
  const res = await call(ctx, 'POST', `/admin/users/${userId}/entitlements`, {
    token: admin,
    body: { courseId, endsAt },
  });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.id as string;
}

describe('public catalog', () => {
  it('lists only live courses and finds them through a parent category', async () => {
    const { seeded, admin } = await setup();
    await call(ctx, 'POST', '/admin/courses', {
      token: admin,
      body: { slug: 'draft-course', title: { en: 'Draft' } },
    });
    const all = await call(ctx, 'GET', '/courses');
    expect(all.body.data.map((c: { slug: string }) => c.slug)).toEqual(['sainey-likhit']);
    const viaAuthority = await call(ctx, 'GET', `/courses?examNodeId=${seeded.authority.id}`);
    expect(viaAuthority.body.data).toHaveLength(1);
    expect((await call(ctx, 'GET', '/courses/draft-course')).status).toBe(404);
  });

  it('shows prices on the web and Android but never on iOS (D-027)', async () => {
    await setup();
    const web = await call(ctx, 'GET', '/courses/sainey-likhit');
    expect(web.body.pricing).toMatchObject({ pricePaisa: 300_000, effectivePricePaisa: 300_000 });
    const android = await call(ctx, 'GET', '/courses/sainey-likhit', {
      headers: { 'x-tk-platform': 'android' },
    });
    expect(android.body.pricing).not.toBeNull();
    const ios = await call(ctx, 'GET', '/courses/sainey-likhit', { headers: { 'x-tk-platform': 'ios' } });
    expect(ios.body.pricing).toBeNull();
    expect(JSON.stringify(ios.body)).not.toContain('300000');

    await setSetting(ctx, 'purchase.channels', { android: 'web_only', ios: 'web_only', web: 'enabled' });
    const androidWebOnly = await call(ctx, 'GET', '/courses', { headers: { 'x-tk-platform': 'android' } });
    expect(androidWebOnly.body.data[0].pricing).toBeNull();
  });

  it('returns course details with subject marks and content counts', async () => {
    await setup();
    const res = await call(ctx, 'GET', '/courses/sainey-likhit');
    expect(res.body.subjects[0]).toMatchObject({
      name: { en: 'English', ne: 'अंग्रेजी' },
      fullMarks: 100,
      passMarks: 40,
      durationMinutes: 180,
    });
    expect(res.body.contentCounts).toMatchObject({ note: 2, pdf: 1, video: 1 });
    expect(res.body.access).toBeNull();
  });
});

describe('premium access is enforced on the server', () => {
  it('locks premium items until access is granted, then unlocks them; revoking locks again', async () => {
    const { admin, seeded, token, userId } = await setup();
    const outline = await call(
      ctx,
      'GET',
      `/courses/${seeded.course.id}/subjects/${seeded.subject.id}/outline`,
      { token },
    );
    const items = outline.body.chapters[0].topics[0].items as Array<{ id: string; locked: boolean }>;
    expect(items.find((i) => i.id === seeded.premiumNote.id)?.locked).toBe(true);
    expect(items.find((i) => i.id === seeded.freeNote.id)?.locked).toBe(false);

    const lockedRes = await call(ctx, 'GET', `/learning-items/${seeded.premiumNote.id}`, { token });
    expect(lockedRes.status).toBe(403);
    expect(lockedRes.body.error.code).toBe('CONTENT_LOCKED');
    expect(JSON.stringify(lockedRes.body)).not.toContain('Premium secret body');
    expect((await call(ctx, 'GET', `/learning-items/${seeded.freeNote.id}`, { token })).status).toBe(200);

    const entitlementId = await grant(admin, userId, seeded.course.id);
    const unlocked = await call(ctx, 'GET', `/learning-items/${seeded.premiumNote.id}`, { token });
    expect(unlocked.status).toBe(200);
    expect(JSON.stringify(unlocked.body.noteContent)).toContain('Premium secret body');
    expect((await call(ctx, 'GET', '/courses/sainey-likhit', { token })).body.access).toEqual({
      entitled: true,
    });
    expect(
      (await call(ctx, 'GET', '/me/courses', { token })).body.map((c: { slug: string }) => c.slug),
    ).toEqual(['sainey-likhit']);

    await call(ctx, 'POST', `/admin/entitlements/${entitlementId}/revoke`, {
      token: admin,
      body: { reason: 'Refunded' },
    });
    expect((await call(ctx, 'GET', `/learning-items/${seeded.premiumNote.id}`, { token })).status).toBe(403);
  });

  it('treats expired access as no access', async () => {
    const { admin, seeded, token, userId } = await setup();
    const id = await grant(admin, userId, seeded.course.id, new Date(Date.now() + 60_000).toISOString());
    expect((await call(ctx, 'GET', `/learning-items/${seeded.premiumNote.id}`, { token })).status).toBe(200);
    await ctx.prisma.entitlement.update({
      where: { id },
      data: { startsAt: new Date(Date.now() - 7_200_000), endsAt: new Date(Date.now() - 1000) },
    });
    expect((await call(ctx, 'GET', `/learning-items/${seeded.premiumNote.id}`, { token })).status).toBe(403);
  });

  it('streams watermarked PDFs only to entitled students and honours the download flag', async () => {
    const { admin, seeded, token, userId } = await setup();
    expect((await call(ctx, 'GET', `/learning-items/${seeded.premiumPdf.id}/pdf`, { token })).status).toBe(
      403,
    );
    await grant(admin, userId, seeded.course.id);
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/learning-items/${seeded.premiumPdf.id}/pdf`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['cache-control']).toBe('private, no-store');
    const { PDFDocument } = await import('pdf-lib');
    const pdf = await PDFDocument.load(res.rawPayload);
    expect(pdf.getPageCount()).toBe(4);
    const download = await call(ctx, 'GET', `/learning-items/${seeded.premiumPdf.id}/pdf?download=true`, {
      token,
    });
    expect(download.status).toBe(403);
  });

  it('gives YouTube playback for free videos and refuses Bunny until it is configured', async () => {
    const { admin, seeded, token } = await setup();
    const playback = await call(ctx, 'GET', `/learning-items/${seeded.freeVideo.id}/playback`, { token });
    expect(playback.body).toMatchObject({
      provider: 'youtube',
      embedUrl: expect.stringContaining('youtube-nocookie.com/embed/dQw4w9WgXcQ'),
    });

    const bunny = await call(ctx, 'POST', `/admin/topics/${seeded.topic.id}/items`, {
      token: admin,
      body: {
        type: 'video',
        title: { en: 'Premium video' },
        accessLevel: 'premium',
        video: { provider: 'bunny', videoId: '32d140e2-e4f4-4eec-9d53-20371e9be607' },
      },
    });
    expect(bunny.status).toBe(503);
    expect(bunny.body.error.code).toBe('VIDEO_PROVIDER_NOT_CONFIGURED');
  });

  it('requires verification before learning when the setting is on (D-029)', async () => {
    const { seeded, token } = await setup();
    await setSetting(ctx, 'auth.verification', {
      channels: { email: true, phone: false },
      requiredForLearning: true,
    });
    const res = await call(ctx, 'GET', `/learning-items/${seeded.freeNote.id}`, { token });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('VERIFICATION_REQUIRED');
  });

  it('keeps archived courses available to students who have access, hidden from everyone else', async () => {
    const { admin, seeded, token, userId } = await setup();
    await grant(admin, userId, seeded.course.id);
    await call(ctx, 'PUT', `/admin/courses/${seeded.course.id}/publishing`, {
      token: admin,
      body: { status: 'archived' },
    });
    expect((await call(ctx, 'GET', '/courses')).body.data).toEqual([]);
    expect((await call(ctx, 'GET', '/courses/sainey-likhit')).status).toBe(404);
    expect((await call(ctx, 'GET', '/courses/sainey-likhit', { token })).status).toBe(200);
    expect(
      (
        await call(ctx, 'GET', `/courses/${seeded.course.id}/subjects/${seeded.subject.id}/outline`, {
          token,
        })
      ).status,
    ).toBe(200);
  });

  it('hides content whose chapter is unpublished', async () => {
    const { admin, seeded, token } = await setup();
    await call(ctx, 'PUT', `/admin/chapters/${seeded.chapter.id}/status`, {
      token: admin,
      body: { status: 'draft' },
    });
    expect((await call(ctx, 'GET', `/learning-items/${seeded.freeNote.id}`, { token })).status).toBe(404);
  });
});
