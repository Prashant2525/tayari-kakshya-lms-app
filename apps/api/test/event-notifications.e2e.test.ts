import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HOME_SECTION_KEYS } from '@tk/contracts';
import { ExamNotificationsService } from '../src/modules/attempts/exam-notifications.service.js';
import { CampaignsService } from '../src/modules/notifications/campaigns.service.js';
import { ALL_CONTENT_PERMISSIONS, seedPublishedCourse } from './content-helpers.js';
import {
  call,
  createStaff,
  createTestApp,
  device,
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
const DAY = 1440 * MIN;
const ANDROID = { 'x-tk-platform': 'android' };
const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
// Scoring choices are test inputs (D-044), not business defaults.
const scoring = {
  negativeMarking: false,
  multipleChoice: 'all_or_nothing',
  match: 'all_or_nothing',
  fillBlank: 'all_or_nothing',
  scoreFloor: 'zero',
};

async function setup() {
  await createStaff(ctx, 'staff@example.com', {
    permissions: [...ALL_CONTENT_PERMISSIONS, 'grading:manage', 'courses:notify'],
  });
  const admin = (await staffLogin(ctx, 'staff@example.com')).token;
  const seeded = await seedPublishedCourse(ctx, admin);
  const student = async (email: string) => {
    const tokens = await registerStudent(ctx, email);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    return { token: tokens.accessToken, id: user.id };
  };
  const grant = async (userId: string) => {
    const res = await call(ctx, 'POST', `/admin/users/${userId}/entitlements`, {
      token: admin,
      body: { courseId: seeded.course.id, endsAt: null },
    });
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  };
  const question = async (content: Record<string, unknown>, marks: number) => {
    const res = await call(ctx, 'POST', '/admin/questions', {
      token: admin,
      body: {
        subjectId: seeded.subject.id,
        difficulty: 'easy',
        defaultMarks: marks,
        accessLevel: 'free',
        tags: [],
        content,
      },
    });
    await call(ctx, 'PUT', `/admin/questions/${res.body.id}/status`, {
      token: admin,
      body: { status: 'published' },
    });
    return res.body.id as string;
  };
  const truth = await question(
    { type: 'true_false', stem: doc('Nepal has seven provinces.'), correct: true },
    1,
  );
  const written = await question(
    { type: 'subjective', stem: doc('Explain judicial review.'), modelAnswer: doc('Courts test laws.') },
    5,
  );
  const assessment = async (overrides: Record<string, unknown>, questions = [truth]) => {
    const created = await call(ctx, 'POST', '/admin/assessments', {
      token: admin,
      body: {
        type: 'subject_test',
        title: { en: 'Constitution test', ne: 'संविधान परीक्षा' },
        subjectId: seeded.subject.id,
        accessLevel: 'free',
        availability: 'always',
        durationMinutes: null,
        maxAttempts: null,
        passMarks: 1,
        scoring,
        shuffleQuestions: false,
        shuffleOptions: false,
        resultRelease: 'immediate',
        showExplanations: true,
        leaderboardEnabled: false,
        subjectiveGrading: 'instructor',
        ...overrides,
      },
    });
    if (created.status !== 201) throw new Error(JSON.stringify(created.body));
    const id = created.body.id as string;
    await call(ctx, 'PUT', `/admin/assessments/${id}/structure`, {
      token: admin,
      body: { sections: [{ pickMode: 'fixed', questions: questions.map((questionId) => ({ questionId })) }] },
    });
    const published = await call(ctx, 'PUT', `/admin/assessments/${id}/publishing`, {
      token: admin,
      body: { status: 'published' },
    });
    if (published.status !== 204) throw new Error(JSON.stringify(published.body));
    return id;
  };
  const take = async (token: string, id: string, answers: unknown[]) => {
    const attempt = (await call(ctx, 'POST', `/assessments/${id}/attempts`, { token })).body;
    await call(ctx, 'PUT', `/attempts/${attempt.id}/answers`, { token, body: { answers } });
    await call(ctx, 'POST', `/attempts/${attempt.id}/submit`, { token });
    return attempt.id as string;
  };
  const inbox = async (token: string) =>
    (await call(ctx, 'GET', '/me/notifications', { token })).body.data as Array<{
      category: string;
      title: { en: string; ne?: string };
      body: { en: string; ne?: string };
      link: Record<string, string> | null;
    }>;
  const deliveries = (userId: string) =>
    ctx.prisma.notificationDelivery.findMany({ where: { userId }, orderBy: { channel: 'asc' } });
  const exams = ctx.app.get(ExamNotificationsService);
  return { admin, seeded, student, grant, truth, written, assessment, take, inbox, deliveries, exams };
}

const answerTrue = (questionId: string) => ({
  questionId,
  response: { type: 'true_false', value: true },
  markedForReview: false,
});

describe('purchase notifications (D-033)', () => {
  it('a paid order is told in the app and by push once; the receipt stays the only email', async () => {
    const s = await setup();
    const asha = await s.student('asha@example.com');
    const order = await call(ctx, 'POST', '/orders', {
      token: asha.token,
      body: { courseId: s.seeded.course.id },
      headers: ANDROID,
    });
    const started = await call(ctx, 'POST', `/orders/${order.body.id}/pay`, {
      token: asha.token,
      body: { provider: 'khalti', returnTo: 'app' },
    });
    const pidx = new URL(started.body.redirectUrl as string).searchParams.get('pidx')!;
    const back = () =>
      call(ctx, 'GET', `/payments/khalti/return?pidx=${pidx}&status=Completed&purchase_order_id=x`);
    await back();
    expect(await s.inbox(asha.token)).toEqual([]);

    ctx.gateways.khaltiPaid(pidx);
    await back();
    await back();
    const [paid, ...rest] = await s.inbox(asha.token);
    expect(rest).toEqual([]);
    expect(paid).toMatchObject({
      category: 'purchase',
      title: { en: 'Payment received: Sainey Likhit' },
      link: { type: 'order', id: order.body.id },
    });
    expect(paid!.body.en).toMatch(/^Order #\d{6} is paid/);
    expect((await s.deliveries(asha.id)).map((d) => d.channel)).toEqual(['push']);
  });
});

describe('result notifications (D-060)', () => {
  it('released by staff: each student is told once, unless they already opened their result', async () => {
    const s = await setup();
    const asha = await s.student('asha@example.com');
    const bina = await s.student('bina@example.com');
    const id = await s.assessment({ resultRelease: 'manual' });
    const ashaAttempt = await s.take(asha.token, id, [answerTrue(s.truth)]);
    await s.take(bina.token, id, [answerTrue(s.truth)]);
    expect(await s.exams.notifyResults()).toBe(0);

    const released = await call(ctx, 'POST', `/admin/assessments/${id}/release-results`, {
      token: s.admin,
    });
    expect(released.status).toBe(200);
    // Bina looks before the worker runs: she has seen it, so only Asha is told.
    await call(
      ctx,
      'GET',
      `/attempts/${(await ctx.prisma.attempt.findFirstOrThrow({ where: { userId: bina.id } })).id}/result`,
      {
        token: bina.token,
      },
    );
    expect(await s.exams.notifyResults()).toBe(1);
    expect(await s.exams.notifyResults()).toBe(0);
    expect(await s.inbox(asha.token)).toEqual([
      expect.objectContaining({
        category: 'result',
        title: { en: 'Your result is out: Constitution test', ne: 'नतिजा प्रकाशित भयो: संविधान परीक्षा' },
        link: { type: 'attempt', id: ashaAttempt },
      }),
    ]);
    expect(await s.inbox(bina.token)).toEqual([]);
    expect((await s.deliveries(asha.id)).map((d) => d.channel)).toEqual(['push', 'email']);
  });

  it('immediate results are seen on submitting; written answers are told when graded; after-close when it closes', async () => {
    const s = await setup();
    const asha = await s.student('asha@example.com');
    const now = Date.now();

    await s.take(asha.token, await s.assessment({}), [answerTrue(s.truth)]);
    expect(await s.exams.notifyResults()).toBe(0);

    const essay = await s.assessment({}, [s.written]);
    const essayAttempt = await s.take(asha.token, essay, [
      { questionId: s.written, response: { type: 'subjective', text: 'Courts.' }, markedForReview: false },
    ]);
    expect(await s.exams.notifyResults()).toBe(0);
    const graded = await call(ctx, 'PUT', `/admin/attempts/${essayAttempt}/answers/${s.written}/grade`, {
      token: s.admin,
      body: { awarded: 3 },
    });
    expect(graded.status).toBe(200);
    expect(await s.exams.notifyResults()).toBe(1);

    const closesAt = new Date(now + 2 * DAY);
    const windowed = await s.assessment({
      availability: 'window',
      opensAt: new Date(now - MIN).toISOString(),
      closesAt: closesAt.toISOString(),
      resultRelease: 'after_close',
    });
    const windowAttempt = await s.take(asha.token, windowed, [answerTrue(s.truth)]);
    expect(await s.exams.notifyResults()).toBe(0);
    expect(await s.exams.notifyResults(new Date(closesAt.getTime() + MIN))).toBe(1);
    expect((await s.inbox(asha.token)).map((n) => n.link)).toEqual([
      { type: 'attempt', id: windowAttempt },
      { type: 'attempt', id: essayAttempt },
    ]);
  });
});

describe('exam reminders (D-060)', () => {
  it('go 1 day and 1 hour before a test opens to the students who can take it, once each', async () => {
    const s = await setup();
    const asha = await s.student('asha@example.com');
    const bina = await s.student('bina@example.com');
    const chandra = await s.student('chandra@example.com');
    await s.grant(asha.id);
    await ctx.prisma.entitlement.create({
      data: {
        userId: chandra.id,
        scopeType: 'course',
        courseId: s.seeded.course.id,
        sourceType: 'free_enrol',
      },
    });
    const now = Date.now();
    const opensAt = new Date(now + 3 * DAY);
    const mock = await s.assessment({
      type: 'mock',
      title: { en: 'Kharidar mock 3' },
      courseId: s.seeded.course.id,
      subjectId: null,
      accessLevel: 'premium',
      availability: 'window',
      opensAt: opensAt.toISOString(),
      closesAt: new Date(opensAt.getTime() + DAY).toISOString(),
    });
    // A draft test is never reminded.
    const draft = await call(ctx, 'POST', '/admin/assessments', {
      token: s.admin,
      body: {
        type: 'mock',
        title: { en: 'Unfinished mock' },
        courseId: s.seeded.course.id,
        accessLevel: 'free',
        availability: 'window',
        opensAt: new Date(now + 2 * DAY).toISOString(),
        closesAt: new Date(now + 4 * DAY).toISOString(),
        durationMinutes: null,
        maxAttempts: null,
        passMarks: 1,
        scoring,
        shuffleQuestions: false,
        shuffleOptions: false,
        resultRelease: 'immediate',
        showExplanations: true,
        leaderboardEnabled: false,
        subjectiveGrading: 'instructor',
      },
    });
    expect(draft.status).toBe(201);

    expect(await s.exams.sendReminders(new Date(now))).toBe(0);
    const dayBefore = new Date(opensAt.getTime() - DAY + MIN);
    expect(await s.exams.sendReminders(dayBefore)).toBe(1);
    expect(await s.exams.sendReminders(dayBefore)).toBe(0);
    expect(await s.exams.sendReminders(new Date(opensAt.getTime() - 2 * 60 * MIN))).toBe(0);
    expect(await s.exams.sendReminders(new Date(opensAt.getTime() - 59 * MIN))).toBe(1);
    expect(await s.exams.sendReminders(new Date(opensAt.getTime() + MIN))).toBe(0);

    const reminders = await s.inbox(asha.token);
    expect(reminders.map((n) => n.title.en)).toEqual([
      'Starts in 1 hour: Kharidar mock 3',
      'Starts in 1 day: Kharidar mock 3',
    ]);
    expect(reminders[1]).toMatchObject({ category: 'exam_reminder', link: { type: 'assessment', id: mock } });
    expect(reminders[1]!.body.en).toMatch(/^It opens on \d{1,2} \w+ \d{4} at \d\d:\d\d \(Nepal time\)\.$/);
    // Bina has no access; Chandra joined the course free, which does not open Premium tests (D-053).
    expect(await s.inbox(bina.token)).toEqual([]);
    expect(await s.inbox(chandra.token)).toEqual([]);
    expect(
      await ctx.prisma.assessmentReminder.findMany({
        where: { assessmentId: mock },
        select: { minutesBefore: true, sent: true, recipients: true },
        orderBy: { minutesBefore: 'asc' },
      }),
    ).toEqual([
      { minutesBefore: 60, sent: true, recipients: 1 },
      { minutesBefore: 1440, sent: true, recipients: 1 },
    ]);

    // Moved to a new time: reminded again.
    const moved = new Date(opensAt.getTime() + 2 * DAY);
    await ctx.prisma.assessment.update({
      where: { id: mock },
      data: { opensAt: moved, closesAt: new Date(moved.getTime() + DAY) },
    });
    expect(await s.exams.sendReminders(new Date(moved.getTime() - DAY + MIN))).toBe(1);
  });

  it('at short notice only the nearest goes; free tests reach the course students; off sends none', async () => {
    const s = await setup();
    const asha = await s.student('asha@example.com');
    await s.student('bina@example.com');
    await s.grant(asha.id);
    const now = Date.now();
    const soon = await s.assessment({
      availability: 'window',
      opensAt: new Date(now + 30 * MIN).toISOString(),
      closesAt: new Date(now + DAY).toISOString(),
    });
    await setSetting(ctx, 'notifications.examReminders', { enabled: false, minutesBefore: [1440, 60] });
    expect(await s.exams.sendReminders(new Date(now))).toBe(0);
    await setSetting(ctx, 'notifications.examReminders', { enabled: true, minutesBefore: [1440, 60] });
    expect(await s.exams.sendReminders(new Date(now))).toBe(1);
    expect(await s.exams.sendReminders(new Date(now))).toBe(0);
    expect(
      await ctx.prisma.assessmentReminder.findMany({
        where: { assessmentId: soon },
        select: { minutesBefore: true, sent: true, recipients: true },
        orderBy: { minutesBefore: 'asc' },
      }),
    ).toEqual([
      { minutesBefore: 60, sent: true, recipients: 1 },
      { minutesBefore: 1440, sent: false, recipients: 0 },
    ]);
    expect((await s.inbox(asha.token)).map((n) => n.title.en)).toEqual([
      'Starts in 30 minutes: Constitution test',
    ]);
    // The same time twice is refused.
    await createStaff(ctx, 'root@example.com', { superAdmin: true });
    const root = (await staffLogin(ctx, 'root@example.com')).token;
    const twice = await call(ctx, 'PUT', '/admin/settings/notifications.examReminders', {
      token: root,
      body: { value: { enabled: true, minutesBefore: [60, 60] } },
    });
    expect(twice.status).toBe(400);
  });
});

describe('course updates (D-060)', () => {
  it("staff tell the course's students; each student's choices apply; every send is kept", async () => {
    const s = await setup();
    const asha = await s.student('asha@example.com');
    const bina = await s.student('bina@example.com');
    const url = `/admin/courses/${s.seeded.course.id}/updates`;
    const update = {
      title: { en: 'New mock tests added' },
      message: { en: 'Three new full mocks are in the course.' },
    };

    expect((await call(ctx, 'POST', url, { token: s.admin, body: update })).status).toBe(409);
    await s.grant(asha.id);
    await call(ctx, 'PUT', '/me/notification-preferences', {
      token: asha.token,
      body: {
        notice: { push: true, email: true },
        course_update: { push: true, email: false },
        exam_reminder: { push: true, email: true },
        result: { push: true, email: true },
        purchase: { push: true, email: true },
      },
    });
    expect(
      (await call(ctx, 'POST', url, { token: s.admin, body: { ...update, title: { en: 'x'.repeat(121) } } }))
        .status,
    ).toBe(400);
    const sent = await call(ctx, 'POST', url, { token: s.admin, body: update });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ recipients: 1 });

    expect(await s.inbox(asha.token)).toEqual([
      expect.objectContaining({
        category: 'course_update',
        title: update.title,
        body: update.message,
        link: { type: 'course', slug: 'sainey-likhit' },
      }),
    ]);
    expect(await s.inbox(bina.token)).toEqual([]);
    expect((await s.deliveries(asha.id)).map((d) => d.channel)).toEqual(['push']);

    const history = (await call(ctx, 'GET', url, { token: s.admin })).body;
    expect(history).toMatchObject({
      students: 1,
      data: [{ title: update.title, recipients: 1, sentBy: 'Staff staff@example.com' }],
    });
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'course.update_sent', entityId: s.seeded.course.id },
      }),
    ).toBe(1);

    // Editing courses is not enough to message their students.
    await createStaff(ctx, 'editor@example.com', { permissions: ['courses:edit'] });
    const editor = (await staffLogin(ctx, 'editor@example.com')).token;
    expect((await call(ctx, 'POST', url, { token: editor, body: update })).status).toBe(403);
    expect((await call(ctx, 'GET', url, { token: asha.token })).status).toBe(403);
  });
});

describe('notification campaigns (D-075)', () => {
  it('staff write, count, send, schedule and cancel campaigns; each audience and choice applies', async () => {
    const s = await setup();
    await createStaff(ctx, 'campaigns@example.com', { permissions: ['campaigns:send'] });
    const staff = (await staffLogin(ctx, 'campaigns@example.com')).token;
    const asha = await s.student('asha@example.com');
    await s.grant(asha.id);
    const bina = await s.student('bina@example.com');
    await call(ctx, 'PUT', '/me/target-posts', {
      token: bina.token,
      body: { examNodeIds: [s.seeded.post.id] },
    });
    await registerStudent(ctx, 'chet@example.com', { ...device('iPhone'), platform: 'ios' });
    const chetId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'chet@example.com' } })).id;
    const url = '/admin/notification-campaigns';
    const count = async (audience: unknown, excludeIos = false) =>
      (await call(ctx, 'POST', `${url}/audience`, { token: staff, body: { audience, excludeIos } })).body
        .recipients;

    // Audiences: course access, an exam category with everything under it, everyone, everyone but iPhone users.
    expect(await count({ type: 'courses', courseIds: [s.seeded.course.id] })).toBe(1);
    expect(await count({ type: 'exam_nodes', examNodeIds: [s.seeded.authority.id] })).toBe(1);
    expect(await count({ type: 'all' })).toBe(3);
    expect(await count({ type: 'all' }, true)).toBe(2);

    const course = {
      title: { en: 'New mock series', ne: 'नयाँ मक सिरिज' },
      message: { en: 'Five full mocks are now in your course.' },
      audience: { type: 'courses', courseIds: [s.seeded.course.id] },
      link: { type: 'course', id: s.seeded.course.id },
    };
    const badLink = await call(ctx, 'POST', url, {
      token: staff,
      body: { ...course, link: { type: 'article', id: s.seeded.course.id } },
    });
    expect(badLink.status).toBe(400);
    const draft = await call(ctx, 'POST', url, { token: staff, body: course });
    expect(draft.status).toBe(201);
    expect(draft.body).toMatchObject({ status: 'draft', push: true, email: false, recipients: 0 });

    const sent = await call(ctx, 'POST', `${url}/${draft.body.id}/send`, { token: staff, body: {} });
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ status: 'sent', recipients: 1 });
    expect(await s.inbox(asha.token)).toEqual([
      expect.objectContaining({
        category: 'announcement',
        title: course.title,
        link: { type: 'course', slug: 'sainey-likhit' },
      }),
    ]);
    expect(await s.inbox(bina.token)).toEqual([]);
    expect((await s.deliveries(asha.id)).map((d) => d.channel)).toEqual(['push']);
    // A sent campaign is a record: it cannot change, be sent again or be deleted.
    expect((await call(ctx, 'PUT', `${url}/${draft.body.id}`, { token: staff, body: course })).status).toBe(
      409,
    );
    expect((await call(ctx, 'POST', `${url}/${draft.body.id}/send`, { token: staff, body: {} })).status).toBe(
      409,
    );
    expect((await call(ctx, 'DELETE', `${url}/${draft.body.id}`, { token: staff })).status).toBe(409);

    // Scheduled for everyone but iPhone users, with email; Bina turned announcement emails off.
    await call(ctx, 'PUT', '/me/notification-preferences', {
      token: bina.token,
      body: {
        notice: { push: true, email: true },
        course_update: { push: true, email: true },
        exam_reminder: { push: true, email: true },
        result: { push: true, email: true },
        purchase: { push: true, email: true },
        announcement: { push: true, email: false },
      },
    });
    const offer = await call(ctx, 'POST', url, {
      token: staff,
      body: {
        title: { en: 'Dashain offer' },
        message: { en: 'Plans are cheaper this week.' },
        audience: { type: 'all' },
        email: true,
        excludeIos: true,
      },
    });
    const at = new Date(Date.now() + 3600_000).toISOString();
    const scheduled = await call(ctx, 'POST', `${url}/${offer.body.id}/send`, {
      token: staff,
      body: { sendAt: at },
    });
    expect(scheduled.body).toMatchObject({ status: 'scheduled', sendAt: at });
    const campaigns = ctx.app.get(CampaignsService);
    expect(await campaigns.dispatchDue(new Date())).toBe(0);
    expect(await campaigns.dispatchDue(new Date(Date.now() + 2 * 3600_000))).toBe(1);
    expect(await campaigns.dispatchDue(new Date(Date.now() + 3 * 3600_000))).toBe(0);
    expect((await call(ctx, 'GET', `${url}/${offer.body.id}`, { token: staff })).body).toMatchObject({
      status: 'sent',
      recipients: 2,
    });
    expect((await s.inbox(bina.token)).map((n: { title: unknown }) => n.title)).toEqual([
      { en: 'Dashain offer' },
    ]);
    expect((await s.deliveries(bina.id)).map((d) => d.channel)).toEqual(['push']);
    expect((await s.deliveries(asha.id)).map((d) => d.channel).sort()).toEqual(['email', 'push', 'push']);
    expect(await ctx.prisma.notification.count({ where: { userId: chetId } })).toBe(0);

    // A scheduled campaign can be cancelled; a draft deleted.
    const later = await call(ctx, 'POST', url, { token: staff, body: course });
    await call(ctx, 'POST', `${url}/${later.body.id}/send`, { token: staff, body: { sendAt: at } });
    expect((await call(ctx, 'POST', `${url}/${later.body.id}/cancel`, { token: staff })).body.status).toBe(
      'cancelled',
    );
    expect(await campaigns.dispatchDue(new Date(Date.now() + 2 * 3600_000))).toBe(0);
    const spare = await call(ctx, 'POST', url, { token: staff, body: course });
    expect((await call(ctx, 'DELETE', `${url}/${spare.body.id}`, { token: staff })).status).toBe(204);
    expect((await call(ctx, 'GET', `${url}/${spare.body.id}`, { token: staff })).status).toBe(404);

    const list = (await call(ctx, 'GET', url, { token: staff })).body.data;
    expect(list.map((c: { status: string }) => c.status)).toEqual(['cancelled', 'sent', 'sent']);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'campaign.sent' } })).toBe(2);

    // Sending to students needs its own permission.
    expect((await call(ctx, 'GET', url, { token: s.admin })).status).toBe(403);
    expect((await call(ctx, 'GET', url, { token: asha.token })).status).toBe(403);
  });
});

describe('Home sections (D-075)', () => {
  it('staff order and hide the app Home sections; the app config follows', async () => {
    await createStaff(ctx, 'home@example.com', { permissions: ['home:manage'] });
    const staff = (await staffLogin(ctx, 'home@example.com')).token;
    const current = await call(ctx, 'GET', '/admin/home-sections', { token: staff });
    expect(current.body.sections).toHaveLength(HOME_SECTION_KEYS.length);
    expect((await call(ctx, 'GET', '/app/config')).body.homeSections).toEqual([...HOME_SECTION_KEYS]);

    const sections = [
      { key: 'upcomingExams', visible: true },
      { key: 'courses', visible: true },
      { key: 'pyq', visible: false },
    ];
    expect(
      (await call(ctx, 'PUT', '/admin/home-sections', { token: staff, body: { sections } })).status,
    ).toBe(200);
    const shown = (await call(ctx, 'GET', '/app/config')).body.homeSections;
    // Listed first in their order, hidden ones left out, the rest after in the default order.
    expect(shown.slice(0, 2)).toEqual(['upcomingExams', 'courses']);
    expect(shown).not.toContain('pyq');
    expect(shown).toHaveLength(HOME_SECTION_KEYS.length - 1);

    const twice = await call(ctx, 'PUT', '/admin/home-sections', {
      token: staff,
      body: { sections: [...sections, { key: 'courses', visible: false }] },
    });
    expect(twice.status).toBe(400);
    await createStaff(ctx, 'other@example.com', { permissions: ['banners:manage'] });
    const other = (await staffLogin(ctx, 'other@example.com')).token;
    expect(
      (await call(ctx, 'PUT', '/admin/home-sections', { token: other, body: { sections } })).status,
    ).toBe(403);
    expect(
      await ctx.prisma.auditLog.count({ where: { action: 'settings.update', entityId: 'home.sections' } }),
    ).toBe(1);
  });
});
