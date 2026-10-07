import { SETTINGS, type DeviceInfo } from '@tk/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountDeletionService } from '../src/modules/auth/account-deletion.service.js';
import { AccountEmailsService } from '../src/modules/notifications/account-emails.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { CourseInterestsService } from '../src/modules/notifications/course-interests.service.js';
import { ALL_CONTENT_PERMISSIONS, seedPublishedCourse } from './content-helpers.js';
import {
  call,
  createStaff,
  createTestApp,
  PASSWORD,
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

const MIN = 60_000;
const IOS = { 'x-tk-platform': 'ios' };
const iphone = (n: number): DeviceInfo => ({
  deviceId: `iphone-device-${n}`,
  deviceName: 'iPhone 15',
  platform: 'ios',
});
const mailsTo = (to: string) => ctx.mail.outbox.filter((m) => m.to === to);

describe('welcome email (D-061)', () => {
  it('every new student gets it once, in their language, with the website; staff and old accounts do not', async () => {
    const welcome = ctx.app.get(AccountEmailsService);
    await registerStudent(ctx, 'asha@example.com');
    const ne = await call(ctx, 'POST', '/auth/register', {
      body: {
        fullName: 'Bina Thapa',
        email: 'bina@example.com',
        password: PASSWORD,
        acceptTerms: true,
        locale: 'ne',
        device: iphone(1),
      },
    });
    expect(ne.status).toBe(201);
    await createStaff(ctx, 'staff@example.com', { permissions: ['users:read'] });
    // An account from before welcome emails (made 4 days ago).
    await ctx.prisma.user.create({
      data: {
        kind: 'student',
        email: 'old@example.com',
        fullName: 'Old Student',
        createdAt: new Date(Date.now() - 4 * 1440 * MIN),
      },
    });

    expect(await welcome.sendWelcome()).toBe(2);
    expect(await welcome.sendWelcome()).toBe(0);
    const [asha] = mailsTo('asha@example.com').filter((m) => m.subject === 'Welcome to Tayari Kakshya');
    expect(asha!.text).toContain('Namaste Asha Rai,');
    expect(asha!.text).toContain('Welcome to Tayari Kakshya. Your account is ready');
    expect(asha!.text).toContain('Sign in at https://web.test.invalid with the same account');
    const [bina] = mailsTo('bina@example.com').filter((m) => m.subject === 'तयारी कक्षामा स्वागत छ');
    expect(bina!.text).toContain('नमस्ते Bina Thapa,');
    expect(bina!.text).toContain('https://web.test.invalid');
    expect(mailsTo('staff@example.com')).toEqual([]);
    expect(mailsTo('old@example.com')).toEqual([]);
  });

  it('follows the CMS text and switch, and retries when email is down', async () => {
    const welcome = ctx.app.get(AccountEmailsService);
    await setSetting(ctx, 'emails.welcome', {
      enabled: false,
      subject: { en: 'Hello {name}', ne: 'नमस्ते {name}' },
      body: { en: 'Courses: {website}', ne: 'कोर्स: {website}' },
    });
    await registerStudent(ctx, 'off@example.com');
    expect(await welcome.sendWelcome()).toBe(0);
    // Switched on later: those who joined while it was off are not sent one.
    await setSetting(ctx, 'emails.welcome', {
      enabled: true,
      subject: { en: 'Hello {name}', ne: 'नमस्ते {name}' },
      body: { en: 'Courses: {website}', ne: 'कोर्स: {website}' },
    });
    expect(await welcome.sendWelcome()).toBe(0);
    expect(mailsTo('off@example.com').filter((m) => m.subject.startsWith('Hello'))).toEqual([]);

    await registerStudent(ctx, 'asha@example.com');
    const send = ctx.mail.send.bind(ctx.mail);
    ctx.mail.send = () => Promise.reject(new Error('SMTP down'));
    try {
      expect(await welcome.sendWelcome()).toBe(0);
    } finally {
      ctx.mail.send = send;
    }
    expect(await welcome.sendWelcome()).toBe(0);
    expect(await welcome.sendWelcome(new Date(Date.now() + 11 * MIN))).toBe(1);
    expect(mailsTo('asha@example.com').find((m) => m.subject === 'Hello Asha Rai')?.text).toMatch(
      /^Courses: https:\/\/web\.test\.invalid\n\n— How to get courses —/,
    );
  });
});

describe('interest from Apple devices (D-061)', () => {
  async function setup() {
    await createStaff(ctx, 'sales@example.com', {
      permissions: [...ALL_CONTENT_PERMISSIONS, 'interests:manage'],
    });
    const admin = (await staffLogin(ctx, 'sales@example.com')).token;
    const seeded = await seedPublishedCourse(ctx, admin);
    const student = async (email: string, dev = iphone(Math.floor(Math.random() * 1e6))) => {
      const tokens = await registerStudent(ctx, email, dev);
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
      return { token: tokens.accessToken, id: user.id };
    };
    const open = (token: string | null, headers = IOS) =>
      call(ctx, 'GET', '/courses/sainey-likhit', token ? { token, headers } : { headers });
    const list = async (query = '') =>
      (await call(ctx, 'GET', `/admin/course-interests${query}`, { token: admin })).body;
    return { admin, seeded, student, open, list };
  }

  it('is noted quietly when an iPhone student opens a paid course they cannot buy, and staff email the link', async () => {
    const s = await setup();
    const asha = await s.student('asha@example.com');
    const page = await s.open(asha.token);
    expect(page.status).toBe(200);
    // Nothing to buy on iOS, and nothing on the page about it (D-027).
    expect(page.body.price ?? null).toBeNull();
    await s.open(asha.token);

    // Not noted: Android (even claiming iOS), signed out, or a student who has access.
    const ravi = await s.student('ravi@example.com', {
      deviceId: 'pixel-device-1',
      deviceName: 'Pixel 8',
      platform: 'android',
    });
    await s.open(ravi.token);
    await s.open(ravi.token, { 'x-tk-platform': 'android' });
    await s.open(null);
    const gita = await s.student('gita@example.com');
    await call(ctx, 'POST', `/admin/users/${gita.id}/entitlements`, {
      token: s.admin,
      body: { courseId: s.seeded.course.id, endsAt: null },
    });
    await s.open(gita.token);

    const open = await s.list('?status=open');
    expect(open.data).toEqual([
      expect.objectContaining({
        student: { id: asha.id, name: 'Asha Rai', email: 'asha@example.com' },
        course: expect.objectContaining({ slug: 'sainey-likhit', title: { en: 'Sainey Likhit' } }),
        deviceName: 'iPhone 15',
        views: 1,
        contactedAt: null,
        hasAccess: false,
      }),
    ]);
    const id = open.data[0].id as string;
    // A later visit counts; one within 30 minutes does not.
    await ctx.app
      .get(CourseInterestsService)
      .record(
        asha.id,
        (await ctx.prisma.authSession.findFirstOrThrow({ where: { userId: asha.id } })).id,
        s.seeded.course.id,
        new Date(Date.now() + 31 * MIN),
      );
    expect((await s.list()).data[0].views).toBe(2);

    const draft = (await call(ctx, 'GET', `/admin/course-interests/${id}/email`, { token: s.admin })).body;
    expect(draft).toMatchObject({
      to: 'asha@example.com',
      locale: 'en',
      link: 'https://web.test.invalid/courses/sainey-likhit',
      subject: 'Sainey Likhit on Tayari Kakshya',
    });
    expect(draft.body).toContain('Namaste Asha Rai,');
    expect(draft.body).toContain('{link}');

    const contact = (body: unknown) =>
      call(ctx, 'POST', `/admin/course-interests/${id}/contact`, { token: s.admin, body });
    expect((await contact({ subject: draft.subject, body: 'No link here' })).status).toBe(400);
    const sent = await contact({ subject: draft.subject, body: draft.body });
    expect(sent.status).toBe(200);
    const mail = mailsTo('asha@example.com').find((m) => m.subject === 'Sainey Likhit on Tayari Kakshya');
    expect(mail!.text).toContain(
      'You can get it on our website: https://web.test.invalid/courses/sainey-likhit',
    );
    // The course link can be tapped in the HTML copy (the full stop after it is not part of the link).
    expect(mail!.html).toContain(
      '<a href="https://web.test.invalid/courses/sainey-likhit" style="color:#2563D6;font-weight:700">',
    );
    expect((await s.list('?status=open')).data).toEqual([]);
    expect((await s.list('?status=contacted')).data[0]).toMatchObject({
      contactedBy: 'Staff sales@example.com',
    });
    expect(
      await ctx.prisma.auditLog.count({ where: { action: 'course_interest.contacted', entityId: id } }),
    ).toBe(1);

    // After buying on the website the list says so.
    await call(ctx, 'POST', `/admin/users/${asha.id}/entitlements`, {
      token: s.admin,
      body: { courseId: s.seeded.course.id, endsAt: null },
    });
    expect((await s.list()).data[0].hasAccess).toBe(true);

    // Only staff with the permission.
    await createStaff(ctx, 'editor@example.com', { permissions: ['courses:edit'] });
    const editor = (await staffLogin(ctx, 'editor@example.com')).token;
    expect((await call(ctx, 'GET', '/admin/course-interests', { token: editor })).status).toBe(403);
    expect((await call(ctx, 'GET', '/admin/course-interests', { token: asha.token })).status).toBe(403);
  });

  it('erasing an account removes its interest, emails and notifications (D-032)', async () => {
    const s = await setup();
    const asha = await s.student('asha@example.com');
    await s.open(asha.token);
    await ctx.app.get(AccountEmailsService).sendWelcome();
    await call(ctx, 'POST', '/me/push-tokens', {
      token: asha.token,
      body: { token: 'ExponentPushToken[erase0000001]', platform: 'ios' },
    });
    // Interest is noted before access; then a course update reaches the student.
    await ctx.prisma.entitlement.create({
      data: { userId: asha.id, scopeType: 'course', courseId: s.seeded.course.id, sourceType: 'admin_grant' },
    });
    await createStaff(ctx, 'notify@example.com', { permissions: ['courses:notify'] });
    const sent = await call(ctx, 'POST', `/admin/courses/${s.seeded.course.id}/updates`, {
      token: (await staffLogin(ctx, 'notify@example.com')).token,
      body: { title: { en: 'Update' }, message: { en: 'New lessons' } },
    });
    expect(sent.status).toBe(201);
    await call(ctx, 'PUT', '/me/notification-preferences', {
      token: asha.token,
      body: {
        notice: { push: true, email: false },
        course_update: { push: true, email: true },
        exam_reminder: { push: true, email: true },
        result: { push: true, email: true },
        purchase: { push: true, email: true },
      },
    });
    const where = { where: { userId: asha.id } };
    expect(await ctx.prisma.courseInterest.count(where)).toBe(1);
    expect(await ctx.prisma.accountEmail.count(where)).toBe(1);
    expect(await ctx.prisma.pushToken.count(where)).toBe(1);
    expect(await ctx.prisma.notification.count(where)).toBe(1);
    expect(await ctx.prisma.notificationDelivery.count(where)).toBeGreaterThan(0);
    expect(await ctx.prisma.notificationPreference.count(where)).toBe(1);

    await call(ctx, 'POST', '/me/deletion', { token: asha.token });
    expect(await ctx.app.get(AccountDeletionService).processDue(new Date(Date.now() + 60 * 86_400_000))).toBe(
      1,
    );
    expect(await ctx.prisma.courseInterest.count(where)).toBe(0);
    expect(await ctx.prisma.accountEmail.count(where)).toBe(0);
    expect(await ctx.prisma.pushToken.count(where)).toBe(0);
    expect(await ctx.prisma.notification.count(where)).toBe(0);
    expect(await ctx.prisma.notificationDelivery.count(where)).toBe(0);
    expect(await ctx.prisma.notificationPreference.count(where)).toBe(0);
  });
});

describe('the "how to get courses" box in emails (D-061)', () => {
  const box = (to: string, subject: string) => mailsTo(to).find((m) => m.subject === subject);

  it('is under the sign-up verification, welcome, notification and buying-link emails, not security codes', async () => {
    await registerStudent(ctx, 'asha@example.com');
    const verify = box('asha@example.com', 'Verify your email')!;
    expect(verify.text).toMatch(/verification code is: \d{6}\./);
    expect(verify.text).toContain('— How to get courses —');
    expect(verify.text).toContain(
      '* On iPhone or iPad, courses and plans cannot be bought in the app. Sign in at https://web.test.invalid with the same account',
    );
    expect(verify.text).toContain('* On Android, buy in the app, or on https://web.test.invalid.');
    expect(verify.text).toContain('Already bought a course? You can ignore this.');
    // The HTML copy highlights the iPhone line and links the website.
    expect(verify.html).toContain('font-weight:700');
    expect(verify.html).toContain('<a href="https://web.test.invalid"');
    expect(verify.html).toContain('On iPhone or iPad, courses and plans cannot be bought in the app.');

    await ctx.app.get(AccountEmailsService).sendWelcome();
    expect(box('asha@example.com', 'Welcome to Tayari Kakshya')!.html).toContain('How to get courses');

    // A password reset code stays short: no box, no links.
    await call(ctx, 'POST', '/auth/password/forgot', { body: { email: 'asha@example.com' } });
    const reset = box('asha@example.com', 'Your password reset code')!;
    expect(reset.text).not.toContain('How to get courses');
    expect(reset.html).toBeUndefined();

    // Notification emails (a course update) carry it too.
    await createStaff(ctx, 'notify@example.com', {
      permissions: [...ALL_CONTENT_PERMISSIONS, 'courses:notify'],
    });
    const staff = (await staffLogin(ctx, 'notify@example.com')).token;
    const seeded = await seedPublishedCourse(ctx, staff);
    const asha = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'asha@example.com' } });
    await call(ctx, 'POST', `/admin/users/${asha.id}/entitlements`, {
      token: staff,
      body: { courseId: seeded.course.id, endsAt: null },
    });
    await call(ctx, 'POST', `/admin/courses/${seeded.course.id}/updates`, {
      token: staff,
      body: { title: { en: 'New mock tests' }, message: { en: 'Three new mocks.' } },
    });
    await ctx.app.get(NotificationsService).processDeliveries();
    const update = box('asha@example.com', 'New mock tests')!;
    expect(update.text).toMatch(
      /^Three new mocks\.\n\n.*Profile → Notifications\.\n\n— How to get courses —/s,
    );
  });

  it("follows the student's language, and the CMS switch", async () => {
    const ne = await call(ctx, 'POST', '/auth/register', {
      body: {
        fullName: 'Bina Thapa',
        email: 'bina@example.com',
        password: PASSWORD,
        acceptTerms: true,
        locale: 'ne',
        device: iphone(7),
      },
    });
    expect(ne.status).toBe(201);
    const verify = box('bina@example.com', 'इमेल प्रमाणीकरण')!;
    expect(verify.text).toContain('— कोर्स कसरी लिने —');
    expect(verify.text).toContain(
      'आइफोन वा आइप्याडको एपबाट कोर्स र प्लान किन्न मिल्दैन। https://web.test.invalid मा',
    );

    const guide = SETTINGS['emails.buyingGuide'].default;
    await setSetting(ctx, 'emails.buyingGuide', { ...guide, enabled: false });
    await registerStudent(ctx, 'off@example.com');
    const off = box('off@example.com', 'Verify your email')!;
    expect(off.text).not.toContain('How to get courses');
    expect(off.html).toBeUndefined();
  });
});
