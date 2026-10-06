import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MailService } from '../src/infra/messaging/mail.service.js';
import { ReceiptsService } from '../src/modules/payments/receipts.service.js';
import { ALL_CONTENT_PERMISSIONS, seedPublishedCourse } from './content-helpers.js';
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

const ANDROID = { 'x-tk-platform': 'android' };
const FY = /^TK-\d{4}\/\d{2}-(\d{6})$/;

async function setup() {
  await createStaff(ctx, 'finance@example.com', {
    permissions: [
      ...ALL_CONTENT_PERMISSIONS,
      'orders:read',
      'coupons:manage',
      'refunds:request',
      'refunds:approve',
    ],
  });
  const admin = (await staffLogin(ctx, 'finance@example.com')).token;
  // Rs 3,000 (seed).
  const seeded = await seedPublishedCourse(ctx, admin);
  const student = async (email = 'asha@example.com') => {
    const tokens = await registerStudent(ctx, email);
    return { token: tokens.accessToken };
  };
  /** Buys the seeded course with Khalti (answered by the test gateway). */
  const buy = async (token: string, couponCode?: string) => {
    const order = await call(ctx, 'POST', '/orders', {
      token,
      body: { courseId: seeded.course.id, ...(couponCode ? { couponCode } : {}) },
      headers: ANDROID,
    });
    if (order.body.status === 'paid') return order.body;
    const started = await call(ctx, 'POST', `/orders/${order.body.id}/pay`, {
      token,
      body: { provider: 'khalti', returnTo: 'app' },
    });
    const pidx = new URL(started.body.redirectUrl).searchParams.get('pidx')!;
    ctx.gateways.khaltiPaid(pidx);
    await call(ctx, 'GET', `/payments/khalti/return?pidx=${pidx}`);
    return (await call(ctx, 'GET', `/orders/${order.body.id}`, { token })).body;
  };
  const premiumNote = (token: string) =>
    call(ctx, 'GET', `/learning-items/${seeded.premiumNote.id}`, { token });
  return { admin, seeded, student, buy, premiumNote };
}

describe('receipts (D-026, D-057)', () => {
  it('each paid order gets the next number; the student downloads it through a short-lived link and gets it by email', async () => {
    const s = await setup();
    const asha = await s.student();
    const bimal = await s.student('bimal@example.com');
    const first = await s.buy(asha.token);
    const second = await s.buy(bimal.token);
    expect(first.receipt.number).toMatch(FY);
    expect(FY.exec(first.receipt.number)![1]).toBe('000001');
    expect(FY.exec(second.receipt.number)![1]).toBe('000002');

    const link = await call(ctx, 'GET', `/orders/${first.id}/receipt`, { token: asha.token });
    expect(link.status).toBe(200);
    const pdf = await ctx.app.inject({ method: 'GET', url: `/api/v1${link.body.path}` });
    expect(pdf.statusCode, pdf.body).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    // Someone else's order, a changed link and an expired one find nothing.
    expect((await call(ctx, 'GET', `/orders/${first.id}/receipt`, { token: bimal.token })).status).toBe(404);
    const forged = link.body.path.replace(/sig=[^&]+/, 'sig=AAAA');
    expect((await ctx.app.inject({ method: 'GET', url: `/api/v1${forged}` })).statusCode).toBe(404);
    const longer = link.body.path.replace(/exp=(\d+)/, (_: string, e: string) => `exp=${Number(e) + 3600}`);
    expect((await ctx.app.inject({ method: 'GET', url: `/api/v1${longer}` })).statusCode).toBe(404);
    const expired = await ctx.app
      .get(ReceiptsService)
      .link(
        first.id,
        (await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'asha@example.com' } })).id,
        new Date(Date.now() - 3_600_000),
      );
    expect((await ctx.app.inject({ method: 'GET', url: `/api/v1${expired.path}` })).statusCode).toBe(404);

    // Email with the PDF attached (sent straight away; the worker retries any that fail).
    await ctx.app.get(ReceiptsService).sendPending();
    const mail = ctx.app
      .get(MailService)
      .outbox.find((m) => m.to === 'asha@example.com' && m.subject.includes(first.receipt.number));
    expect(mail?.attachments?.[0]).toMatchObject({ contentType: 'application/pdf' });
    expect(mail!.text).toContain(first.receipt.number);
    const invoice = await ctx.prisma.invoice.findUniqueOrThrow({ where: { orderId: first.id } });
    expect(invoice).toMatchObject({
      emailStatus: 'sent',
      kind: 'receipt',
      totalPaisa: 300_000,
      paidWith: 'khalti',
    });
  });

  it('numbering follows the CMS setting; receipts cannot be changed or deleted', async () => {
    const s = await setup();
    await setSetting(ctx, 'commerce.receipts', { prefix: 'ACAD', resetEachFiscalYear: false });
    await setSetting(ctx, 'commerce.tax', {
      vatRegistered: true,
      rateBps: 1300,
      pricesIncludeVat: true,
      businessName: 'Test Academy',
      panNumber: '123456789',
      address: 'Kathmandu',
    });
    const asha = await s.student();
    const order = await s.buy(asha.token);
    expect(order.receipt.number).toBe('ACAD-000001');
    const invoice = await ctx.prisma.invoice.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(invoice).toMatchObject({
      kind: 'tax_invoice',
      fiscalYear: null,
      seller: { businessName: 'Test Academy', panNumber: '123456789' },
      taxRateBps: 1300,
      taxPaisa: 34_513,
    });
    await expect(
      ctx.prisma.invoice.update({ where: { id: invoice.id }, data: { totalPaisa: 1 } }),
    ).rejects.toThrow();
    await expect(ctx.prisma.invoice.delete({ where: { id: invoice.id } })).rejects.toThrow();
    // Delivery status may still change.
    await ctx.prisma.invoice.update({ where: { id: invoice.id }, data: { emailStatus: 'failed' } });
  });

  it('a Rs 0 order (full coupon) gets a receipt too', async () => {
    const s = await setup();
    await call(ctx, 'POST', '/admin/coupons', {
      token: s.admin,
      body: {
        code: 'FREE',
        note: null,
        discountType: 'percent',
        percentBps: 10_000,
        amountPaisa: null,
        maxDiscountPaisa: null,
        minOrderPaisa: null,
        startsAt: null,
        endsAt: null,
        maxRedemptions: null,
        perUserLimit: null,
        appliesTo: 'everything',
        courseIds: [],
        planIds: [],
        allowOnSale: false,
        active: true,
      },
    });
    const asha = await s.student();
    const order = await s.buy(asha.token, 'FREE');
    expect(order).toMatchObject({ status: 'paid', totalPaisa: 0 });
    expect(order.receipt.number).toMatch(FY);
    expect(await ctx.prisma.invoice.findUniqueOrThrow({ where: { orderId: order.id } })).toMatchObject({
      paidWith: null,
      couponCode: 'FREE',
      discountPaisa: 300_000,
    });
  });
});

describe('refunds (D-026, D-057)', () => {
  it('request → approve → sent; a partial refund keeps access, the rest removes it', async () => {
    const s = await setup();
    const asha = await s.student();
    const order = await s.buy(asha.token);
    const request = (amountPaisa: number) =>
      call(ctx, 'POST', `/admin/orders/${order.id}/refunds`, {
        token: s.admin,
        body: { amountPaisa, reason: 'Paid twice by mistake' },
      });
    expect((await request(400_000)).body.error.details.reason).toBe('exceeds_paid');

    const part = await request(100_000);
    expect(part.status).toBe(201);
    expect(part.body).toMatchObject({
      status: 'requested',
      amountPaisa: 100_000,
      order: { orderNo: order.orderNo },
    });
    // While it is open, only the rest can be asked for.
    expect((await request(250_000)).body.error.details.reason).toBe('exceeds_paid');

    const approved = await call(ctx, 'POST', `/admin/refunds/${part.body.id}/approve`, {
      token: s.admin,
      body: { note: 'Goodwill' },
    });
    expect(approved.body).toMatchObject({ status: 'approved', full: false });
    expect((await s.premiumNote(asha.token)).status).toBe(200);
    expect(
      (
        await call(ctx, 'POST', `/admin/refunds/${part.body.id}/approve`, {
          token: s.admin,
          body: { note: null },
        })
      ).status,
    ).toBe(409);

    const rest = await request(200_000);
    const full = await call(ctx, 'POST', `/admin/refunds/${rest.body.id}/approve`, {
      token: s.admin,
      body: { note: null },
    });
    expect(full.body).toMatchObject({ status: 'approved', full: true, order: { status: 'refunded' } });
    expect((await s.premiumNote(asha.token)).status).toBe(403);
    const access = await ctx.prisma.entitlement.findFirstOrThrow({ where: { sourceId: order.id } });
    expect(access).toMatchObject({ status: 'revoked', revokedReason: 'refund' });
    expect((await call(ctx, 'GET', `/orders/${order.id}`, { token: asha.token })).body.status).toBe(
      'refunded',
    );
    expect((await call(ctx, 'GET', '/me/orders', { token: asha.token })).body[0].status).toBe('refunded');
    expect((await request(1)).body.error.details.reason).toBe('not_paid');

    expect(
      (
        await call(ctx, 'POST', `/admin/refunds/${rest.body.id}/complete`, {
          token: s.admin,
          body: { reference: '', note: null },
        })
      ).status,
    ).toBe(400);
    const sent = await call(ctx, 'POST', `/admin/refunds/${rest.body.id}/complete`, {
      token: s.admin,
      body: { reference: 'KHALTI-RF-991', note: 'Refunded from the merchant portal' },
    });
    expect(sent.body).toMatchObject({ status: 'refunded', providerReference: 'KHALTI-RF-991' });

    const detail = await call(ctx, 'GET', `/admin/orders/${order.id}`, { token: s.admin });
    expect(detail.body.refunds.map((r: { status: string }) => r.status)).toEqual(['approved', 'refunded']);
    const list = await call(ctx, 'GET', '/admin/refunds?status=approved', { token: s.admin });
    expect(list.body.data).toHaveLength(1);
    const actions = (await ctx.prisma.auditLog.findMany({ where: { entityType: 'refund' } })).map(
      (a) => a.action,
    );
    expect(actions.sort()).toEqual(
      ['refund.approve', 'refund.approve', 'refund.complete', 'refund.request', 'refund.request'].sort(),
    );
  });

  it('rejecting keeps access; only approvers decide; unpaid and Rs 0 orders cannot be refunded', async () => {
    const s = await setup();
    const asha = await s.student();
    const order = await s.buy(asha.token);
    await createStaff(ctx, 'support@example.com', { permissions: ['orders:read', 'refunds:request'] });
    const support = (await staffLogin(ctx, 'support@example.com')).token;
    const asked = await call(ctx, 'POST', `/admin/orders/${order.id}/refunds`, {
      token: support,
      body: { amountPaisa: 300_000, reason: 'Wrong course' },
    });
    expect(asked.status).toBe(201);
    expect(
      (
        await call(ctx, 'POST', `/admin/refunds/${asked.body.id}/approve`, {
          token: support,
          body: { note: null },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(ctx, 'POST', `/admin/refunds/${asked.body.id}/complete`, {
          token: s.admin,
          body: { reference: 'X', note: null },
        })
      ).status,
    ).toBe(409);
    const rejected = await call(ctx, 'POST', `/admin/refunds/${asked.body.id}/reject`, {
      token: s.admin,
      body: { note: 'Course already used' },
    });
    expect(rejected.body).toMatchObject({ status: 'rejected', decisionNote: 'Course already used' });
    expect((await s.premiumNote(asha.token)).status).toBe(200);
    // A rejected request no longer counts against what can be refunded.
    expect(
      (
        await call(ctx, 'POST', `/admin/orders/${order.id}/refunds`, {
          token: support,
          body: { amountPaisa: 300_000, reason: 'Asked again' },
        })
      ).status,
    ).toBe(201);

    const bimal = await s.student('bimal@example.com');
    const pending = await call(ctx, 'POST', '/orders', {
      token: bimal.token,
      body: { courseId: s.seeded.course.id },
      headers: ANDROID,
    });
    expect(
      (
        await call(ctx, 'POST', `/admin/orders/${pending.body.id}/refunds`, {
          token: s.admin,
          body: { amountPaisa: 100, reason: 'Not paid' },
        })
      ).body.error.details.reason,
    ).toBe('not_paid');
  });
});
