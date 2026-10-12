import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NoticesService } from '../src/modules/notices/notices.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import {
  call,
  createStaff,
  createTestApp,
  registerStudent,
  staffLogin,
  type TestContext,
  upload,
} from './helpers.js';
import { pdfFixture, pngFixture } from './fixtures.js';

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
const notice = (overrides: Record<string, unknown> = {}) => ({
  kind: 'official',
  title: { en: 'Kharidar exam form open', ne: 'खरिदार परीक्षा फारम खुल्यो' },
  body: doc('Forms are open until the end of the month. Apply on the PSC website.'),
  isPinned: false,
  expiresAt: null,
  notify: false,
  ...overrides,
});
const TOKEN = (n: number) => `ExponentPushToken[testdevice${String(n).padStart(4, '0')}]`;

async function staff() {
  await createStaff(ctx, 'writer@example.com', { permissions: ['notices:edit'] });
  await createStaff(ctx, 'publisher@example.com', { permissions: ['notices:edit', 'notices:publish'] });
  return {
    writer: (await staffLogin(ctx, 'writer@example.com')).token,
    publisher: (await staffLogin(ctx, 'publisher@example.com')).token,
  };
}

async function publish(token: string, body = notice()) {
  const created = await call(ctx, 'POST', '/admin/notices', { token, body });
  if (created.status !== 201) throw new Error(JSON.stringify(created.body));
  await call(ctx, 'PUT', `/admin/notices/${created.body.id}/status`, {
    token,
    body: { status: 'published' },
  });
  return created.body.id as string;
}

describe('notices (D-019, D-060)', () => {
  it('writers draft and submit; only publishers publish; changes are audited', async () => {
    const s = await staff();
    const created = await call(ctx, 'POST', '/admin/notices', { token: s.writer, body: notice() });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect(
      (
        await call(ctx, 'PUT', `/admin/notices/${id}/status`, {
          token: s.writer,
          body: { status: 'in_review' },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(ctx, 'PUT', `/admin/notices/${id}/status`, {
          token: s.writer,
          body: { status: 'published' },
        })
      ).status,
    ).toBe(403);
    const published = await call(ctx, 'PUT', `/admin/notices/${id}/status`, {
      token: s.publisher,
      body: { status: 'published' },
    });
    expect(published.body).toMatchObject({ status: 'published', live: true });
    // A live notice can be changed only by a publisher (T-026).
    expect((await call(ctx, 'PUT', `/admin/notices/${id}`, { token: s.writer, body: notice() })).status).toBe(
      403,
    );
    expect(
      (
        await call(ctx, 'PUT', `/admin/notices/${id}`, {
          token: s.publisher,
          body: notice({ isPinned: true }),
        })
      ).status,
    ).toBe(200);
    // Rich text is checked against the allow-list.
    const bad = notice({ body: { en: { type: 'doc', content: [{ type: 'script' }] } } });
    expect((await call(ctx, 'POST', '/admin/notices', { token: s.writer, body: bad })).status).toBe(400);
    const actions = (await ctx.prisma.auditLog.findMany({ where: { entityType: 'notice' } })).map(
      (a) => a.action,
    );
    expect(actions.sort()).toEqual(
      ['notice.create', 'notice.status', 'notice.status', 'notice.update'].sort(),
    );
    expect((await call(ctx, 'GET', '/admin/notices', { token: s.writer })).body.data).toHaveLength(1);
  });

  it('the Notice tab shows live notices (pinned first), not drafts, future or expired ones; the badge counts new ones', async () => {
    const s = await staff();
    const student = (await registerStudent(ctx)).accessToken;
    const older = await publish(s.publisher, notice({ title: { en: 'Older' } }));
    await ctx.prisma.notice.update({
      where: { id: older },
      data: { publishAt: new Date(Date.now() - 3_600_000) },
    });
    const pinned = await publish(s.publisher, notice({ title: { en: 'Pinned' }, isPinned: true }));
    await ctx.prisma.notice.update({
      where: { id: pinned },
      data: { publishAt: new Date(Date.now() - 7_200_000) },
    });
    await call(ctx, 'POST', '/admin/notices', {
      token: s.publisher,
      body: notice({ title: { en: 'Draft' } }),
    });
    const later = await call(ctx, 'POST', '/admin/notices', {
      token: s.publisher,
      body: notice({ title: { en: 'Later' } }),
    });
    await call(ctx, 'PUT', `/admin/notices/${later.body.id}/status`, {
      token: s.publisher,
      body: { status: 'scheduled', publishAt: new Date(Date.now() + 3_600_000).toISOString() },
    });
    await publish(
      s.publisher,
      notice({ title: { en: 'Expired' }, expiresAt: new Date(Date.now() + 1000).toISOString() }),
    );
    await ctx.prisma.notice.updateMany({
      where: { title: { path: ['en'], equals: 'Expired' } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const list = await call(ctx, 'GET', '/notices', { token: student });
    expect(list.body.data.map((n: { title: { en: string } }) => n.title.en)).toEqual(['Pinned', 'Older']);
    expect(list.body.data[0].summary.en).toContain('Forms are open');
    expect((await call(ctx, 'GET', `/notices/${older}`, { token: student })).body).toMatchObject({
      kind: 'official',
    });
    expect((await call(ctx, 'GET', `/notices/${later.body.id}`, { token: student })).status).toBe(404);

    // The scheduled one goes live at its time.
    await ctx.prisma.notice.update({
      where: { id: later.body.id },
      data: { publishAt: new Date(Date.now() - 1000) },
    });
    expect((await call(ctx, 'GET', '/notices', { token: student })).body.data).toHaveLength(3);

    // Badge: notices published since the student joined (the older ones were before), until they open the tab.
    expect((await call(ctx, 'GET', '/me/notices/unseen', { token: student })).body.count).toBe(0);
    await publish(s.publisher, notice({ title: { en: 'Fresh' } }));
    expect((await call(ctx, 'GET', '/me/notices/unseen', { token: student })).body.count).toBe(1);
    await call(ctx, 'POST', '/me/notices/seen', { token: student });
    expect((await call(ctx, 'GET', '/me/notices/unseen', { token: student })).body.count).toBe(0);
    // Staff cannot use the student endpoints, and students cannot reach the CMS.
    expect((await call(ctx, 'GET', '/notices', { token: s.writer })).status).toBe(403);
    expect((await call(ctx, 'GET', '/admin/notices', { token: student })).status).toBe(403);
  });

  it('a notice with "notify" goes once by push and email, as each student chose; gone devices are switched off', async () => {
    const s = await staff();
    const asha = (await registerStudent(ctx, 'asha@example.com')).accessToken;
    const bimal = (await registerStudent(ctx, 'bimal@example.com')).accessToken;
    const chandra = (await registerStudent(ctx, 'chandra@example.com')).accessToken;
    await call(ctx, 'PATCH', '/me', { token: bimal, body: { locale: 'ne' } });
    await call(ctx, 'POST', '/me/push-tokens', {
      token: asha,
      body: { token: TOKEN(1), platform: 'android' },
    });
    await call(ctx, 'POST', '/me/push-tokens', { token: bimal, body: { token: TOKEN(2), platform: 'ios' } });
    const prefs = (await call(ctx, 'GET', '/me/notification-preferences', { token: chandra })).body;
    expect(prefs.notice).toEqual({ push: true, email: true });
    await call(ctx, 'PUT', '/me/notification-preferences', {
      token: chandra,
      body: { ...prefs, notice: { push: false, email: false } },
    });

    // Without "notify" nothing is sent.
    await publish(s.publisher, notice({ title: { en: 'Quiet' } }));
    const id = await publish(s.publisher, notice({ notify: true }));
    const notices = ctx.app.get(NoticesService);
    const notifications = ctx.app.get(NotificationsService);
    expect(await notices.dispatchDue()).toBe(1);
    expect(await notices.dispatchDue()).toBe(0);
    await notifications.processDeliveries();

    expect(ctx.push.sent.map((m) => [m.to, m.title])).toEqual(
      expect.arrayContaining([
        [TOKEN(1), 'Kharidar exam form open'],
        [TOKEN(2), 'खरिदार परीक्षा फारम खुल्यो'],
      ]),
    );
    expect(ctx.push.sent).toHaveLength(2);
    expect(ctx.push.sent[0]!.data).toMatchObject({ link: { type: 'notice', id }, category: 'notice' });
    const mails = ctx.mail.outbox.filter(
      (m) => m.subject.includes('Kharidar') || m.subject.includes('खरिदार'),
    );
    expect(mails.map((m) => m.to).sort()).toEqual(['asha@example.com', 'bimal@example.com']);
    expect(mails.find((m) => m.to === 'asha@example.com')!.text).toContain('Forms are open');
    // Nothing waits; running again sends nothing twice.
    expect(await ctx.prisma.notificationDelivery.count({ where: { status: 'pending' } })).toBe(0);
    expect(await notifications.processDeliveries()).toBe(0);

    // A device Expo no longer knows is switched off; a student without devices gets no push.
    ctx.push.gone.add(TOKEN(1));
    const second = await publish(s.publisher, notice({ notify: true, title: { en: 'Second' } }));
    await notices.dispatchDue();
    await notifications.processDeliveries();
    expect(
      (await ctx.prisma.pushToken.findUniqueOrThrow({ where: { token: TOKEN(1) } })).invalidatedAt,
    ).not.toBeNull();
    const ashaPush = await ctx.prisma.notificationDelivery.findFirstOrThrow({
      where: { sourceKey: `notice:${second}`, channel: 'push', user: { email: 'asha@example.com' } },
    });
    expect(ashaPush.status).toBe('skipped');
  });

  it('push is retried when Expo cannot be reached', async () => {
    const s = await staff();
    const asha = (await registerStudent(ctx)).accessToken;
    await call(ctx, 'POST', '/me/push-tokens', {
      token: asha,
      body: { token: TOKEN(3), platform: 'android' },
    });
    await publish(s.publisher, notice({ notify: true }));
    const notices = ctx.app.get(NoticesService);
    const notifications = ctx.app.get(NotificationsService);
    await notices.dispatchDue();
    ctx.push.down = true;
    await notifications.processDeliveries();
    const waiting = await ctx.prisma.notificationDelivery.findFirstOrThrow({ where: { channel: 'push' } });
    expect(waiting).toMatchObject({ status: 'pending', attempts: 1 });
    expect(waiting.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    ctx.push.down = false;
    await notifications.processDeliveries(new Date(Date.now() + 10 * 60_000));
    expect(
      (await ctx.prisma.notificationDelivery.findUniqueOrThrow({ where: { id: waiting.id } })).status,
    ).toBe('sent');
  });
});

describe('notice attachments (D-074 / audit F-12)', () => {
  it('attaches media-library PDFs; students read them while the notice is live; attached PDFs cannot be deleted', async () => {
    await createStaff(ctx, 'media@example.com', {
      permissions: ['notices:edit', 'notices:publish', 'media:manage'],
    });
    const token = (await staffLogin(ctx, 'media@example.com')).token;
    const pdf = (
      await upload(
        ctx,
        token,
        { name: 'psc-notice.pdf', contentType: 'application/pdf', data: await pdfFixture(2) },
        { visibility: 'private' },
      )
    ).body;
    const image = (
      await upload(
        ctx,
        token,
        { name: 'logo.png', contentType: 'image/png', data: await pngFixture() },
        { visibility: 'public' },
      )
    ).body;
    const refused = await call(ctx, 'POST', '/admin/notices', {
      token,
      body: notice({ attachmentMediaIds: [image.id] }),
    });
    expect(refused.status).toBe(400);

    const id = await publish(token, notice({ attachmentMediaIds: [pdf.id] }));
    expect((await call(ctx, 'GET', `/admin/notices/${id}`, { token })).body.attachments).toEqual([
      { id: pdf.id, name: 'psc-notice.pdf', sizeBytes: expect.any(Number) },
    ]);
    const student = (await registerStudent(ctx, 'reader@example.com')).accessToken;
    const detail = await call(ctx, 'GET', `/notices/${id}`, { token: student });
    expect(detail.body.attachments).toEqual([
      expect.objectContaining({ id: pdf.id, name: 'psc-notice.pdf' }),
    ]);
    const file = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/notices/${id}/attachments/${pdf.id}`,
      headers: { authorization: `Bearer ${student}` },
    });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    // Anything not attached, or a draft notice, finds nothing; a signed-out visitor is refused.
    expect(
      (await call(ctx, 'GET', `/notices/${id}/attachments/${image.id}`, { token: student })).status,
    ).toBe(404);
    expect(
      (await ctx.app.inject({ method: 'GET', url: `/api/v1/notices/${id}/attachments/${pdf.id}` }))
        .statusCode,
    ).toBe(401);
    const draft = (
      await call(ctx, 'POST', '/admin/notices', { token, body: notice({ attachmentMediaIds: [pdf.id] }) })
    ).body.id;
    expect(
      (await call(ctx, 'GET', `/notices/${draft}/attachments/${pdf.id}`, { token: student })).status,
    ).toBe(404);
    // Still attached: the media library keeps it.
    expect((await call(ctx, 'DELETE', `/admin/media/${pdf.id}`, { token })).status).toBe(409);
  });
});

describe('notifications (D-033)', () => {
  it('the in-app list, unread count and marking read; preferences and push tokens are validated', async () => {
    const asha = (await registerStudent(ctx)).accessToken;
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'asha@example.com' } });
    const notifications = ctx.app.get(NotificationsService);
    const event = (n: number) => ({
      category: 'purchase' as const,
      title: { en: `Payment ${n}` },
      body: { en: 'You now have access.' },
      link: { type: 'order' as const, id: '00000000-0000-7000-8000-000000000001' },
      sourceKey: `test:${n}`,
      inApp: true,
      push: false,
      email: false,
    });
    await notifications.notify([user.id], event(1));
    await notifications.notify([user.id], event(2));
    await notifications.notify([user.id, user.id], event(2)); // same event: once
    const list = await call(ctx, 'GET', '/me/notifications', { token: asha });
    expect(list.body.data.map((n: { title: { en: string } }) => n.title.en)).toEqual([
      'Payment 2',
      'Payment 1',
    ]);
    expect(list.body.data[0]).toMatchObject({ read: false, link: { type: 'order' } });
    expect((await call(ctx, 'GET', '/me/notifications/unread', { token: asha })).body.count).toBe(2);
    await call(ctx, 'POST', '/me/notifications/read', { token: asha, body: { ids: [list.body.data[0].id] } });
    expect((await call(ctx, 'GET', '/me/notifications/unread', { token: asha })).body.count).toBe(1);
    await call(ctx, 'POST', '/me/notifications/read', { token: asha, body: { ids: [] } });
    expect((await call(ctx, 'GET', '/me/notifications/unread', { token: asha })).body.count).toBe(0);

    const bad = await call(ctx, 'PUT', '/me/notification-preferences', {
      token: asha,
      body: { notice: { push: true } },
    });
    expect(bad.status).toBe(400);
    expect(
      (
        await call(ctx, 'POST', '/me/push-tokens', {
          token: asha,
          body: { token: 'not-a-token', platform: 'android' },
        })
      ).status,
    ).toBe(400);
    await call(ctx, 'POST', '/me/push-tokens', {
      token: asha,
      body: { token: TOKEN(5), platform: 'android' },
    });
    await call(ctx, 'POST', '/me/push-tokens/remove', { token: asha, body: { token: TOKEN(5) } });
    expect(
      (await ctx.prisma.pushToken.findUniqueOrThrow({ where: { token: TOKEN(5) } })).invalidatedAt,
    ).not.toBeNull();
  });
});
