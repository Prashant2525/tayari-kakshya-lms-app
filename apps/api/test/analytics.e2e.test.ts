import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nepalDay } from '../src/modules/attempts/engagement.service.js';
import { addDays } from '../src/modules/progress/progress.service.js';
import { publisher, seedPublishedCourse } from './content-helpers.js';
import {
  call,
  createStaff,
  createTestApp,
  registerStudent,
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

async function setup() {
  const admin = await publisher(ctx);
  const seeded = await seedPublishedCourse(ctx, admin);
  await createStaff(ctx, 'finance@example.com', {
    permissions: ['orders:read', 'users:read', 'courses:edit', 'assessments:edit'],
  });
  const finance = (await staffLogin(ctx, 'finance@example.com')).token;
  const financeUser = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'finance@example.com' } });
  const student = async (email: string, fullName = 'Asha Rai') => {
    const token = (await registerStudent(ctx, email)).accessToken;
    const user = await ctx.prisma.user.update({ where: { email }, data: { fullName } });
    return { token, id: user.id };
  };
  /** A paid order (test fixture: checkout and gateways have their own tests). */
  const paidOrder = async (
    userId: string,
    totalPaisa: number,
    paidAt: Date,
    channel: 'android' | 'web',
    provider: 'khalti' | 'esewa',
  ) => {
    const order = await ctx.prisma.order.create({
      data: {
        userId,
        status: 'paid',
        channel,
        subtotalPaisa: totalPaisa,
        totalPaisa,
        expiresAt: new Date(paidAt.getTime() + DAY),
        paidAt,
        createdAt: paidAt,
        items: {
          create: {
            itemType: 'course',
            courseId: seeded.course.id,
            titleSnapshot: { en: 'Sainey Likhit' },
            unitPricePaisa: totalPaisa,
            validitySnapshot: {},
          },
        },
        payments: {
          create: {
            provider,
            status: 'completed',
            amountPaisa: totalPaisa,
            returnTo: 'web',
            completedAt: paidAt,
          },
        },
      },
    });
    return order;
  };
  return { admin, seeded, finance, financeUser, student, paidOrder };
}

describe('admin dashboards (D-066)', () => {
  it('reports sales and refunds per Nepal day, channel, provider and course', async () => {
    const s = await setup();
    const asha = await s.student('asha@example.com');
    const now = new Date();
    const today = nepalDay(now);
    await s.paidOrder(asha.id, 300_000, now, 'android', 'khalti');
    await s.paidOrder(asha.id, 200_000, new Date(now.getTime() - 2 * DAY), 'web', 'esewa');
    const old = await s.paidOrder(asha.id, 999_900, new Date(now.getTime() - 60 * DAY), 'web', 'esewa');
    // A pending order never counts.
    await ctx.prisma.order.create({
      data: {
        userId: asha.id,
        status: 'pending',
        channel: 'web',
        subtotalPaisa: 50_000,
        totalPaisa: 50_000,
        expiresAt: new Date(now.getTime() + DAY),
      },
    });
    // A refund sent today (for an older order) lowers today's net.
    await ctx.prisma.refund.create({
      data: {
        orderId: old.id,
        amountPaisa: 100_000,
        reason: 'Test',
        status: 'refunded',
        requestedById: s.financeUser.id,
        decidedById: s.financeUser.id,
        decidedAt: now,
        refundedById: s.financeUser.id,
        refundedAt: now,
        providerReference: 'KHALTI-REFUND-1',
      },
    });

    const res = await call(ctx, 'GET', '/admin/analytics/sales', { token: s.finance });
    expect(res.status).toBe(200);
    expect(res.body.period).toEqual({ from: addDays(today, -29), to: today });
    expect(res.body.totals).toEqual({
      orders: 2,
      revenuePaisa: 500_000,
      refundsPaisa: 100_000,
      refunds: 1,
      netPaisa: 400_000,
      averageOrderPaisa: 250_000,
      discountPaisa: 0,
      couponOrders: 0,
    });
    expect(res.body.daily).toHaveLength(30);
    expect(res.body.daily.at(-1)).toEqual({ day: today, orders: 1, revenuePaisa: 300_000 });
    expect(res.body.channels).toEqual([
      { key: 'android', orders: 1, revenuePaisa: 300_000 },
      { key: 'web', orders: 1, revenuePaisa: 200_000 },
    ]);
    expect(res.body.providers.map((p: { key: string }) => p.key)).toEqual(['khalti', 'esewa']);
    expect(res.body.items).toEqual([
      expect.objectContaining({
        type: 'course',
        id: s.seeded.course.id,
        title: { en: 'Sainey Likhit' },
        orders: 2,
        revenuePaisa: 500_000,
      }),
    ]);
    // A period ending yesterday leaves today's order out (periods are whole Nepal days).
    const untilYesterday = await call(
      ctx,
      'GET',
      `/admin/analytics/sales?from=${addDays(today, -29)}&to=${addDays(today, -1)}`,
      {
        token: s.finance,
      },
    );
    expect(untilYesterday.body.totals).toMatchObject({ orders: 1, revenuePaisa: 200_000 });
    // A wider period takes the old order in.
    const wide = await call(ctx, 'GET', `/admin/analytics/sales?from=${addDays(today, -90)}&to=${today}`, {
      token: s.finance,
    });
    expect(wide.body.totals.orders).toBe(3);
    expect(wide.body.daily).toHaveLength(91);

    // Periods: start after end, or longer than 366 days, are refused; dashboards need their permission.
    expect(
      (
        await call(ctx, 'GET', `/admin/analytics/sales?from=${today}&to=${addDays(today, -1)}`, {
          token: s.finance,
        })
      ).status,
    ).toBe(400);
    expect(
      (await call(ctx, 'GET', `/admin/analytics/sales?from=${addDays(today, -400)}`, { token: s.finance }))
        .status,
    ).toBe(400);
    expect(
      (await call(ctx, 'GET', '/admin/analytics/sales?from=yesterday', { token: s.finance })).status,
    ).toBe(400);
    expect((await call(ctx, 'GET', '/admin/analytics/sales', { token: s.admin })).status).toBe(403);
    expect((await call(ctx, 'GET', '/admin/analytics/sales', { token: asha.token })).status).toBe(403);
  });

  it('reports students, learning and tests', async () => {
    const s = await setup();
    const asha = await s.student('asha@example.com');
    await s.student('bina@example.com', 'Bina Gurung');
    const today = nepalDay(new Date());
    const students = await call(ctx, 'GET', '/admin/analytics/students', { token: s.finance });
    expect(students.body.totals).toEqual({ students: 2, signups: 2, active: 2 });
    expect(students.body.daily.at(-1)).toEqual({ day: today, signups: 2, active: 2 });
    expect(students.body.signupPlatforms).toEqual([{ key: expect.any(String), count: 2 }]);

    // Learning: an enrolment, finished lessons, study time.
    const granted = await call(ctx, 'POST', `/admin/users/${asha.id}/entitlements`, {
      token: s.admin,
      body: { courseId: s.seeded.course.id, endsAt: null },
    });
    expect(granted.status).toBe(201);
    for (const id of [s.seeded.freeNote.id, s.seeded.premiumNote.id]) {
      await call(ctx, 'PUT', `/learning-items/${id}/progress`, {
        token: asha.token,
        body: { completed: true },
      });
    }
    await call(ctx, 'POST', '/me/study-time', {
      token: asha.token,
      body: { activity: 'reading', seconds: 120 },
    });
    const learning = await call(ctx, 'GET', '/admin/analytics/learning', { token: s.finance });
    expect(learning.status).toBe(200);
    expect(learning.body.totals).toEqual({
      enrolments: 1,
      lessonsFinished: 2,
      studySeconds: 120,
      learners: 1,
    });
    expect(learning.body.daily.at(-1)).toEqual({
      day: today,
      enrolments: 1,
      lessonsFinished: 2,
      studySeconds: 120,
    });
    expect(learning.body.sources).toEqual([{ key: 'admin_grant', count: 1 }]);
    expect(learning.body.courses).toEqual([
      { id: s.seeded.course.id, title: { en: 'Sainey Likhit' }, enrolments: 1 },
    ]);
    expect(learning.body.lessons).toHaveLength(2);

    // Tests: the hardest questions need at least 10 answers; reported questions are listed.
    const q = await call(ctx, 'POST', '/admin/questions', {
      token: s.admin,
      body: {
        subjectId: s.seeded.subject.id,
        difficulty: 'easy',
        defaultMarks: 1,
        accessLevel: 'free',
        tags: [],
        content: {
          type: 'true_false',
          stem: {
            en: {
              type: 'doc',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Is Everest in Nepal?' }] }],
            },
          },
          correct: true,
        },
      },
    });
    await call(ctx, 'PUT', `/admin/questions/${q.body.id}/status`, {
      token: s.admin,
      body: { status: 'published' },
    });
    await ctx.prisma.practiceAnswer.createMany({
      data: Array.from({ length: 9 }, (_, i) => ({
        userId: asha.id,
        questionId: q.body.id,
        source: 'practice' as const,
        outcome: i < 3 ? ('correct' as const) : ('wrong' as const),
      })),
    });
    let tests = await call(ctx, 'GET', '/admin/analytics/tests', { token: s.finance });
    expect(tests.body.hardest).toEqual([]);
    await ctx.prisma.practiceAnswer.create({
      data: { userId: asha.id, questionId: q.body.id, source: 'practice', outcome: 'partial' },
    });
    await call(ctx, 'POST', `/questions/${q.body.id}/reports`, {
      token: asha.token,
      body: { reason: 'typo', message: null },
    });
    tests = await call(ctx, 'GET', '/admin/analytics/tests', { token: s.finance });
    // (3 + 0.5) of 10.
    expect(tests.body.hardest).toEqual([
      expect.objectContaining({ id: q.body.id, answered: 10, accuracy: 35, preview: 'Is Everest in Nepal?' }),
    ]);
    expect(tests.body.reported).toEqual([expect.objectContaining({ id: q.body.id, reports: 1 })]);
    expect(tests.body.totals.openReports).toBe(1);
  });
});

describe('CSV exports (D-066)', () => {
  it('downloads orders and students as audited CSV with BS and AD dates', async () => {
    const s = await setup();
    const asha = await s.student('asha@example.com', '=HYPERLINK("http://evil")');
    await s.paidOrder(asha.id, 300_000, new Date(), 'android', 'khalti');

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/exports/orders.csv',
      headers: { authorization: `Bearer ${s.finance}`, 'x-tk-client': 'admin' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="orders-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(res.headers['x-export-rows']).toBe('1');
    const lines = res.body.split('\r\n');
    expect(lines[0]!.charCodeAt(0)).toBe(0xfeff);
    expect(lines[0]!.slice(1)).toMatch(/^Order no,Created \(BS\),Created \(AD\),/);
    // A name that looks like a formula is neutralised.
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(lines[1]).toContain(',3000.00,');
    expect(lines[1]).toContain(',khalti,');

    const students = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/exports/students.csv',
      headers: { authorization: `Bearer ${s.finance}`, 'x-tk-client': 'admin' },
    });
    expect(students.body).toContain('asha@example.com');
    for (const kind of ['enrolments', 'test-results']) {
      const r = await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/admin/exports/${kind}.csv`,
        headers: { authorization: `Bearer ${s.finance}`, 'x-tk-client': 'admin' },
      });
      expect(r.statusCode, kind).toBe(200);
    }
    const audits = await ctx.prisma.auditLog.findMany({
      where: { action: 'export.download' },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((a) => (a.changes as { kind: string }).kind)).toEqual([
      'orders',
      'students',
      'enrolments',
      'test-results',
    ]);
    expect(audits[0]).toMatchObject({ changes: expect.objectContaining({ rows: 1, truncated: false }) });

    // The same permission as the matching dashboard.
    const denied = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/admin/exports/orders.csv',
      headers: { authorization: `Bearer ${s.admin}`, 'x-tk-client': 'admin' },
    });
    expect(denied.statusCode).toBe(403);
  });
});
