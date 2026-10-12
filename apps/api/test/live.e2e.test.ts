import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LiveService } from '../src/modules/live/live.service.js';
import { ALL_CONTENT_PERMISSIONS, seedPublishedCourse } from './content-helpers.js';
import { call, createStaff, registerStudent, setSetting, staffLogin, type TestContext } from './helpers.js';
import { createTestApp } from './helpers.js';

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

const MIN = 60_000;
const YOUTUBE = 'https://www.youtube.com/live/dQw4w9WgXcQ';
const ZOOM = 'https://us02web.zoom.us/j/81234567890';

async function setup() {
  await createStaff(ctx, 'teacher@example.com', { permissions: [...ALL_CONTENT_PERMISSIONS, 'live:manage'] });
  const token = (await staffLogin(ctx, 'teacher@example.com')).token;
  const seeded = await seedPublishedCourse(ctx, token);
  const buyer = await registerStudent(ctx, 'buyer@example.com');
  const visitor = await registerStudent(ctx, 'visitor@example.com');
  const buyerUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'buyer@example.com' } });
  const grant = await call(ctx, 'POST', `/admin/users/${buyerUser.id}/entitlements`, {
    token,
    body: { courseId: seeded.course.id, endsAt: null },
  });
  expect(grant.status).toBeLessThan(300);
  // A student who joined the course while it was free (D-053): no premium access.
  await registerStudent(ctx, 'freebie@example.com');
  const freebie = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'freebie@example.com' } });
  await ctx.prisma.entitlement.create({
    data: { userId: freebie.id, scopeType: 'course', courseId: seeded.course.id, sourceType: 'free_enrol' },
  });
  const klass = (startsAt: Date, overrides: Record<string, unknown> = {}) => ({
    courseId: seeded.course.id,
    title: { en: 'Constitution revision', ne: 'संविधान पुनरावलोकन' },
    description: { en: 'Part 3: fundamental rights' },
    provider: 'youtube',
    joinUrl: YOUTUBE,
    passcode: null,
    startsAt: startsAt.toISOString(),
    durationMinutes: 60,
    accessLevel: 'premium',
    instructorId: null,
    ...overrides,
  });
  return { token, seeded, buyer: buyer.accessToken, visitor: visitor.accessToken, buyerUser, klass };
}

const notificationsOf = (email: string, key: string) =>
  ctx.prisma.notification.count({ where: { user: { email }, sourceKey: { contains: key } } });

describe('live classes (S22, D-072)', () => {
  it('schedules, publishes, reminds, goes live, takes attendance, ends and keeps the recording', async () => {
    const { token, seeded, buyer, visitor, klass } = await setup();
    const live = ctx.app.get(LiveService);
    const startsAt = new Date(Date.now() + 2 * 60 * MIN);

    // Links must match the provider; YouTube has no passcode.
    expect(
      (await call(ctx, 'POST', '/admin/live-classes', { token, body: klass(startsAt, { joinUrl: ZOOM }) }))
        .status,
    ).toBe(400);
    expect(
      (await call(ctx, 'POST', '/admin/live-classes', { token, body: klass(startsAt, { passcode: '123' }) }))
        .status,
    ).toBe(400);

    // A draft: staff see it, students do not.
    const created = await call(ctx, 'POST', '/admin/live-classes', { token, body: klass(startsAt) });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({ published: false, status: 'scheduled', joinUrl: YOUTUBE });
    expect(
      (await call(ctx, 'GET', `/live-classes?courseId=${seeded.course.id}`, { token: buyer })).body.data,
    ).toEqual([]);
    expect((await call(ctx, 'GET', `/live-classes/${id}`, { token: buyer })).status).toBe(404);

    // Publishing tells the students with premium access (not the visitor).
    expect((await call(ctx, 'POST', `/admin/live-classes/${id}/publish`, { token })).body.published).toBe(
      true,
    );
    expect(await notificationsOf('buyer@example.com', `live:${id}:scheduled`)).toBe(1);
    expect(await notificationsOf('visitor@example.com', `live:${id}`)).toBe(0);
    expect(await notificationsOf('freebie@example.com', `live:${id}`)).toBe(0);

    // Students see it — never the link — and cannot join before it opens.
    const listed = await call(ctx, 'GET', `/live-classes?courseId=${seeded.course.id}`, { token: buyer });
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0]).toMatchObject({ id, access: true, canJoin: false, status: 'scheduled' });
    expect(JSON.stringify(listed.body)).not.toContain('dQw4w9WgXcQ');
    const early = await call(ctx, 'POST', `/live-classes/${id}/join`, { token: buyer });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('LIVE_CLASS_CLOSED');
    expect(early.body.error.details.opensAt).toBe(new Date(startsAt.getTime() - 10 * MIN).toISOString());
    // A student without access sees it locked, and cannot join.
    const locked = await call(ctx, 'GET', `/live-classes/${id}`, { token: visitor });
    expect(locked.body).toMatchObject({ access: false, canJoin: false });
    expect((await call(ctx, 'POST', `/live-classes/${id}/join`, { token: visitor })).body.error.code).toBe(
      'CONTENT_LOCKED',
    );

    // The worker: one reminder (CMS minutes), at the start time it goes live, then it ends after the grace time.
    await live.dispatchDue(new Date(startsAt.getTime() - 40 * MIN));
    expect(await notificationsOf('buyer@example.com', `live:${id}:reminder`)).toBe(0);
    await live.dispatchDue(new Date(startsAt.getTime() - 25 * MIN));
    await live.dispatchDue(new Date(startsAt.getTime() - 20 * MIN));
    expect(await notificationsOf('buyer@example.com', `live:${id}:reminder`)).toBe(1);
    expect((await live.dispatchDue(new Date(startsAt.getTime() + MIN))).started).toBe(1);
    expect(await notificationsOf('buyer@example.com', `live:${id}:live`)).toBe(1);

    // Joining gives the player and records attendance.
    const joined = await call(ctx, 'POST', `/live-classes/${id}/join`, { token: buyer });
    expect(joined.status).toBe(200);
    expect(joined.body).toMatchObject({ provider: 'youtube', passcode: null });
    expect(joined.body.embedUrl).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&modestbranding=1',
    );
    await call(ctx, 'POST', `/live-classes/${id}/join`, { token: buyer });
    const attendance = await call(ctx, 'GET', `/admin/live-classes/${id}/attendance`, { token });
    expect(attendance.body).toMatchObject({ total: 1, data: [{ email: 'buyer@example.com', joins: 2 }] });
    const exported = await call(ctx, 'GET', `/admin/live-classes/${id}/attendance.csv`, { token });
    expect(exported.headers['content-type']).toContain('text/csv');
    expect(String(exported.body)).toContain('buyer@example.com');

    // Ended by the worker once well past its planned end (60 min + 30 min grace).
    expect((await live.dispatchDue(new Date(startsAt.getTime() + 80 * MIN))).ended).toBe(0);
    expect((await live.dispatchDue(new Date(startsAt.getTime() + 91 * MIN))).ended).toBe(1);
    expect((await call(ctx, 'POST', `/live-classes/${id}/join`, { token: buyer })).body.error.code).toBe(
      'LIVE_CLASS_CLOSED',
    );
    const past = await call(ctx, 'GET', `/live-classes?courseId=${seeded.course.id}&when=past`, {
      token: buyer,
    });
    expect(past.body.data[0]).toMatchObject({ id, status: 'ended', hasRecording: false, attended: true });

    // The recording, for students with access.
    expect((await call(ctx, 'GET', `/live-classes/${id}/recording`, { token: buyer })).status).toBe(404);
    const rec = await call(ctx, 'PUT', `/admin/live-classes/${id}/recording`, {
      token,
      body: { recording: { provider: 'youtube', url: 'https://youtu.be/9bZkp7q19f0' } },
    });
    expect(rec.body.recording).toMatchObject({ provider: 'youtube', videoId: '9bZkp7q19f0' });
    expect(
      (await call(ctx, 'GET', `/live-classes/${id}/recording`, { token: buyer })).body.embedUrl,
    ).toContain('9bZkp7q19f0');
    expect(
      (await call(ctx, 'GET', `/live-classes/${id}/recording`, { token: visitor })).body.error.code,
    ).toBe('CONTENT_LOCKED');

    // Every staff change is audited.
    const actions = await ctx.prisma.auditLog.findMany({
      where: { entityType: 'live_class', entityId: id },
      select: { action: true },
    });
    expect(actions.map((a) => a.action).sort()).toEqual(
      ['export.download', 'live.created', 'live.published', 'live.recording_set'].sort(),
    );
  });

  it('opens free Zoom classes to every student, reschedules, cancels and checks permissions', async () => {
    const { token, seeded, visitor, buyer, klass } = await setup();
    await setSetting(ctx, 'live.rules', { reminderMinutes: 30, joinOpensMinutes: 15, endGraceMinutes: 30 });
    const startsAt = new Date(Date.now() + 10 * MIN);
    const created = await call(ctx, 'POST', '/admin/live-classes', {
      token,
      body: klass(startsAt, { provider: 'zoom', joinUrl: ZOOM, passcode: 'tk2083', accessLevel: 'free' }),
    });
    const id = created.body.id as string;
    await call(ctx, 'POST', `/admin/live-classes/${id}/publish`, { token });

    // Free: a student without the course can join inside the window (opens 15 minutes before, per the CMS).
    const joined = await call(ctx, 'POST', `/live-classes/${id}/join`, { token: visitor });
    expect(joined.status).toBe(200);
    expect(joined.body).toEqual({ provider: 'zoom', embedUrl: null, joinUrl: ZOOM, passcode: 'tk2083' });

    // A new time tells students again; a cancellation too, and it can no longer be joined.
    const later = new Date(startsAt.getTime() + 60 * MIN);
    const moved = await call(ctx, 'PUT', `/admin/live-classes/${id}`, {
      token,
      body: klass(later, { provider: 'zoom', joinUrl: ZOOM, passcode: 'tk2083', accessLevel: 'free' }),
    });
    expect(moved.body.startsAt).toBe(later.toISOString());
    expect(await notificationsOf('buyer@example.com', `live:${id}:time:`)).toBe(1);
    expect((await call(ctx, 'POST', `/admin/live-classes/${id}/cancel`, { token })).body.status).toBe(
      'cancelled',
    );
    expect(await notificationsOf('buyer@example.com', `live:${id}:cancelled`)).toBe(1);
    expect((await call(ctx, 'POST', `/live-classes/${id}/join`, { token: visitor })).body.error.code).toBe(
      'LIVE_CLASS_CLOSED',
    );
    // A cancelled class stays listed (as cancelled) until its time; it cannot be changed or started.
    const upcoming = await call(ctx, 'GET', `/live-classes?courseId=${seeded.course.id}`, { token: buyer });
    expect(upcoming.body.data[0]).toMatchObject({ id, status: 'cancelled' });
    expect((await call(ctx, 'POST', `/admin/live-classes/${id}/start`, { token })).status).toBe(409);

    // Without a course, a student sees the classes of their own courses only.
    expect(
      (await call(ctx, 'GET', '/live-classes', { token: buyer })).body.data.map((l: { id: string }) => l.id),
    ).toEqual([id]);
    expect((await call(ctx, 'GET', '/live-classes', { token: visitor })).body.data).toEqual([]);

    // Staff without live:manage, students and anonymous callers are kept out of the CMS endpoints.
    await createStaff(ctx, 'editor@example.com', { permissions: ALL_CONTENT_PERMISSIONS });
    const editor = (await staffLogin(ctx, 'editor@example.com')).token;
    expect((await call(ctx, 'GET', '/admin/live-classes', { token: editor })).status).toBe(403);
    expect((await call(ctx, 'GET', '/admin/live-classes', { token: buyer })).status).toBe(403);
    expect((await call(ctx, 'GET', '/admin/live-classes')).status).toBe(401);
    expect((await call(ctx, 'GET', '/live-classes')).status).toBe(401);
    // The staff list shows it, with its attendance.
    const list = await call(ctx, 'GET', `/admin/live-classes?courseId=${seeded.course.id}`, { token });
    expect(list.body.data[0]).toMatchObject({ id, status: 'cancelled', attendance: 1, passcode: 'tk2083' });
  });
});
