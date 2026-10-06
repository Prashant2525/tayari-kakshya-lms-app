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
      canEnrol: false,
      certificate: null,
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

describe('free courses are joined with an enrol step (L6)', () => {
  async function freeCourse(admin: string, courseId: string, validity: Record<string, unknown> = {}) {
    const res = await call(ctx, 'PUT', `/admin/courses/${courseId}/pricing`, {
      token: admin,
      body: {
        pricePaisa: 0,
        salePricePaisa: null,
        saleStartsAt: null,
        saleEndsAt: null,
        validityType: 'days',
        validityDays: 30,
        validityEndsOn: null,
        ...validity,
      },
    });
    if (res.status >= 300) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  }
  const enrol = (courseId: string, token?: string) =>
    call(ctx, 'POST', `/courses/${courseId}/enrol`, token ? { token } : {});

  it('enrolling adds the course for its validity; premium items still need paid access (D-053)', async () => {
    const { admin, seeded, token, userId } = await setup();
    await freeCourse(admin, seeded.course.id);

    const before = await call(ctx, 'GET', '/courses/sainey-likhit', { token });
    expect(before.body).toMatchObject({ isFree: true, access: { entitled: false, canEnrol: true } });
    expect((await call(ctx, 'GET', `/learning-items/${seeded.premiumNote.id}`, { token })).status).toBe(403);

    const started = Date.now();
    const res = await enrol(seeded.course.id, token);
    expect(res.status).toBe(201);
    expect(res.body.enrolled).toBe(true);
    const days = (Date.parse(res.body.endsAt) - started) / 86_400_000;
    expect(days).toBeGreaterThan(29.99);
    expect(days).toBeLessThan(30.01);

    // D-053: a free enrolment opens the free lessons only; premium ones need paid access or a staff grant.
    const item = await call(ctx, 'GET', `/learning-items/${seeded.premiumNote.id}`, { token });
    expect(item.status).toBe(403);
    expect(JSON.stringify(item.body)).not.toContain('Premium secret body');
    expect((await call(ctx, 'GET', `/learning-items/${seeded.freeNote.id}`, { token })).status).toBe(200);
    const mine = await call(ctx, 'GET', '/me/courses', { token });
    expect(mine.body.map((c: { id: string }) => c.id)).toEqual([seeded.course.id]);
    const after = await call(ctx, 'GET', '/courses/sainey-likhit', { token });
    expect(after.body.access).toEqual({ entitled: true, canEnrol: false, certificate: null });

    const rows = await ctx.prisma.entitlement.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceType: 'free_enrol', grantedById: null });
    const audit = await ctx.prisma.auditLog.findFirst({ where: { action: 'entitlement.enrol_free' } });
    expect(audit).toMatchObject({ actorUserId: userId, entityId: rows[0]!.id });
  });

  it('a free course sharing a subject with a paid course does not unlock the paid lessons (D-053)', async () => {
    const { admin, seeded, token, userId } = await setup();
    // The seeded course stays paid; a second, free course uses the same subject.
    const free = await call(ctx, 'POST', '/admin/courses', {
      token: admin,
      body: { slug: 'free-taster', title: { en: 'Free taster' } },
    });
    await freeCourse(admin, free.body.id);
    await call(ctx, 'PUT', `/admin/courses/${free.body.id}/subjects`, {
      token: admin,
      body: { subjects: [{ subjectId: seeded.subject.id }] },
    });
    await call(ctx, 'PUT', `/admin/courses/${free.body.id}/publishing`, {
      token: admin,
      body: { status: 'published' },
    });
    expect((await enrol(free.body.id, token)).status).toBe(201);

    for (const id of [seeded.premiumNote.id, seeded.premiumPdf.id]) {
      expect((await call(ctx, 'GET', `/learning-items/${id}`, { token })).status).toBe(403);
    }
    const outline = await call(
      ctx,
      'GET',
      `/courses/${seeded.course.id}/subjects/${seeded.subject.id}/outline`,
      {
        token,
      },
    );
    expect(outline.body.hasPremiumAccess).toBe(false);
    // A staff grant (or a purchase) of the paid course unlocks them.
    await grant(admin, userId, seeded.course.id);
    expect((await call(ctx, 'GET', `/learning-items/${seeded.premiumNote.id}`, { token })).status).toBe(200);
  });

  it('is idempotent, including under concurrent taps', async () => {
    const { admin, seeded, token, userId } = await setup();
    await freeCourse(admin, seeded.course.id, { validityType: 'lifetime', validityDays: null });
    const results = await Promise.all(Array.from({ length: 5 }, () => enrol(seeded.course.id, token)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(results.every((r) => r.body.endsAt === null)).toBe(true);
    expect(await ctx.prisma.entitlement.count({ where: { userId } })).toBe(1);
    expect((await enrol(seeded.course.id, token)).body).toEqual({ enrolled: false, endsAt: null });
  });

  it('does not enrol twice when a slower request carries an earlier time (regression)', async () => {
    const { admin, seeded, userId } = await setup();
    await freeCourse(admin, seeded.course.id, { validityType: 'lifetime', validityDays: null });
    const { EntitlementsService } = await import('../src/modules/content/entitlements.service.js');
    const service = ctx.app.get(EntitlementsService);
    const client = { ip: '127.0.0.1', userAgent: null, requestId: 'test' };
    const later = new Date(Date.now() + 1000);
    const earlier = new Date(Date.now() - 1000);
    expect(await service.enrolFree(userId, seeded.course.id, client, later)).toMatchObject({
      enrolled: true,
    });
    expect(await service.enrolFree(userId, seeded.course.id, client, earlier)).toMatchObject({
      enrolled: false,
    });
    expect(await ctx.prisma.entitlement.count({ where: { userId } })).toBe(1);
  });

  it('refuses paid, unpublished and closed courses', async () => {
    const { admin, seeded, token, userId } = await setup();
    const paid = await enrol(seeded.course.id, token);
    expect(paid.status).toBe(409);
    expect(paid.body.error).toMatchObject({
      code: 'ENROLMENT_NOT_AVAILABLE',
      details: { reason: 'not_free' },
    });
    expect((await call(ctx, 'GET', '/courses/sainey-likhit', { token })).body.access.canEnrol).toBe(false);

    await freeCourse(admin, seeded.course.id);
    // A fixed end date that has already passed (set directly: the CMS form may refuse past dates).
    await ctx.prisma.course.update({
      where: { id: seeded.course.id },
      data: {
        validityType: 'fixed_date',
        validityDays: null,
        validityEndsOn: new Date('2020-01-01T00:00:00Z'),
      },
    });
    const closed = await enrol(seeded.course.id, token);
    expect(closed.status).toBe(409);
    expect(closed.body.error.details).toEqual({ reason: 'access_period_ended' });
    expect((await call(ctx, 'GET', '/courses/sainey-likhit', { token })).body.access.canEnrol).toBe(false);

    await freeCourse(admin, seeded.course.id);
    await call(ctx, 'PUT', `/admin/courses/${seeded.course.id}/publishing`, {
      token: admin,
      body: { status: 'draft' },
    });
    expect((await enrol(seeded.course.id, token)).status).toBe(404);
    expect(await ctx.prisma.entitlement.count({ where: { userId } })).toBe(0);
  });

  it('is for signed-in students only', async () => {
    const { admin, seeded } = await setup();
    await freeCourse(admin, seeded.course.id);
    expect((await enrol(seeded.course.id)).status).toBe(401);
    expect((await enrol(seeded.course.id, admin)).status).toBe(403);
    expect(await ctx.prisma.entitlement.count()).toBe(0);
  });
});
