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

const DAY = 86_400_000;
const near = (iso: string, expected: number) => Math.abs(Date.parse(iso) - expected) < 60_000;

describe('offline lessons (S11, D-067)', () => {
  it('downloads notes with a licence the app renews, and revokes it when access ends', async () => {
    const admin = await publisher(ctx);
    const seeded = await seedPublishedCourse(ctx, admin);
    const { accessToken: token } = await registerStudent(ctx, 'asha@example.com');
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'asha@example.com' } });
    const download = (id: string) => call(ctx, 'POST', `/learning-items/${id}/offline`, { token });
    const refresh = (itemIds: string[]) =>
      call(ctx, 'POST', '/me/offline/refresh', { token, body: { itemIds } });

    // The app learns the rules from its config.
    expect((await call(ctx, 'GET', '/app/config')).body.offline).toEqual({ enabled: true, days: 7 });

    // A free note: its content and a 7-day licence (CMS default).
    let res = await download(seeded.freeNote.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: seeded.freeNote.id, type: 'note', noteContent: expect.any(Object) });
    expect(near(res.body.expiresAt, Date.now() + 7 * DAY)).toBe(true);
    expect(near(res.body.serverTime, Date.now())).toBe(true);
    const version = res.body.version as string;

    // Premium needs access, as online; videos and PDFs are not offline yet (D-067).
    expect((await download(seeded.premiumNote.id)).body.error.code).toBe('CONTENT_LOCKED');
    expect((await download(seeded.freeVideo.id)).status).toBe(403);
    expect((await download(seeded.premiumPdf.id)).status).toBe(403);
    const grant = await call(ctx, 'POST', `/admin/users/${user.id}/entitlements`, {
      token: admin,
      body: { courseId: seeded.course.id, endsAt: null },
    });
    expect((await download(seeded.premiumNote.id)).status).toBe(200);

    // The CMS sets the days.
    await setSetting(ctx, 'offline.rules', { enabled: true, days: 3 });
    res = await refresh([seeded.freeNote.id, seeded.premiumNote.id]);
    expect(res.status).toBe(200);
    expect(res.body.licences).toEqual([
      { id: seeded.freeNote.id, expiresAt: expect.any(String), version },
      { id: seeded.premiumNote.id, expiresAt: expect.any(String), version: expect.any(String) },
    ]);
    expect(near(res.body.licences[0].expiresAt, Date.now() + 3 * DAY)).toBe(true);

    // A changed note shows a new version, so the app downloads it again.
    await ctx.prisma.learningItem.update({
      where: { id: seeded.freeNote.id },
      data: { title: { en: 'Intro (new)' } },
    });
    expect((await refresh([seeded.freeNote.id])).body.licences[0].version).not.toBe(version);

    // Access ended, or the lesson is unknown: revoked.
    const revoke = await call(ctx, 'POST', `/admin/entitlements/${grant.body.id}/revoke`, {
      token: admin,
      body: { reason: 'Refunded' },
    });
    expect(revoke.status).toBeLessThan(300);
    res = await refresh([seeded.premiumNote.id, '00000000-0000-7000-8000-000000000000']);
    expect(res.body.licences).toEqual([
      { id: seeded.premiumNote.id, expiresAt: null, version: null },
      { id: '00000000-0000-7000-8000-000000000000', expiresAt: null, version: null },
    ]);

    // Offline switched off by staff: nothing new, and every copy is revoked.
    await setSetting(ctx, 'offline.rules', { enabled: false, days: 7 });
    expect((await download(seeded.freeNote.id)).status).toBe(403);
    expect((await refresh([seeded.freeNote.id])).body.licences).toEqual([
      { id: seeded.freeNote.id, expiresAt: null, version: null },
    ]);

    // Limits and audiences.
    expect((await refresh(Array.from({ length: 201 }, () => seeded.freeNote.id))).status).toBe(400);
    expect(
      (await call(ctx, 'POST', '/me/offline/refresh', { token: admin, body: { itemIds: [] } })).status,
    ).toBe(403);
    expect((await call(ctx, 'POST', '/me/offline/refresh', { body: { itemIds: [] } })).status).toBe(401);
  });
});
