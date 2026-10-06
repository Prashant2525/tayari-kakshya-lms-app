import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { ALL_CONTENT_PERMISSIONS, seedPublishedCourse } from './content-helpers.js';
import { FakeGateways } from './fake-gateways.js';
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

const MIN = 60_000;
const ANDROID = { 'x-tk-platform': 'android' };

async function setup() {
  await createStaff(ctx, 'finance@example.com', {
    permissions: [...ALL_CONTENT_PERMISSIONS, 'orders:read', 'orders:manage'],
  });
  const admin = (await staffLogin(ctx, 'finance@example.com')).token;
  // Rs 3,000, 365 days of access (seed); a sale makes it Rs 2,500.
  const seeded = await seedPublishedCourse(ctx, admin);
  const student = async (email = 'asha@example.com') => {
    const tokens = await registerStudent(ctx, email);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    return { token: tokens.accessToken, id: user.id };
  };
  const order = (token: string, body: unknown = { courseId: seeded.course.id }, headers = ANDROID) =>
    call(ctx, 'POST', '/orders', { token, body, headers });
  const pay = (token: string, orderId: string, provider: 'esewa' | 'khalti', returnTo = 'app') =>
    call(ctx, 'POST', `/orders/${orderId}/pay`, { token, body: { provider, returnTo } });
  const khaltiReturn = (pidx: string) =>
    call(ctx, 'GET', `/payments/khalti/return?pidx=${pidx}&status=Completed&purchase_order_id=forged`);
  const view = (token: string, orderId: string) => call(ctx, 'GET', `/orders/${orderId}`, { token });
  const premiumNote = (token: string) =>
    call(ctx, 'GET', `/learning-items/${seeded.premiumNote.id}`, { token });
  return { admin, seeded, student, order, pay, khaltiReturn, view, premiumNote };
}

const pidxOf = (redirectUrl: string) => new URL(redirectUrl).searchParams.get('pidx')!;

describe('buying a course (Phase 11)', () => {
  it('Khalti: server price, verified payment, access with the bought validity, receipt in my orders', async () => {
    const s = await setup();
    const asha = await s.student();
    await call(ctx, 'PUT', `/admin/courses/${s.seeded.course.id}/pricing`, {
      token: s.admin,
      body: {
        pricePaisa: 300_000,
        salePricePaisa: 250_000,
        saleStartsAt: null,
        saleEndsAt: null,
        validityType: 'days',
        validityDays: 365,
        validityEndsOn: null,
      },
    });
    expect(
      (await call(ctx, 'GET', '/payments/options', { token: asha.token, headers: ANDROID })).body,
    ).toEqual({
      providers: [
        { provider: 'esewa', testMode: true },
        { provider: 'khalti', testMode: true },
      ],
    });

    // The client cannot set the price: only the course id is read.
    const created = await s.order(asha.token, {
      courseId: s.seeded.course.id,
      totalPaisa: 100,
      pricePaisa: 100,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      status: 'pending',
      totalPaisa: 250_000,
      items: [{ pricePaisa: 250_000 }],
    });
    // Tapping Buy again reuses the unpaid order.
    expect((await s.order(asha.token)).body.id).toBe(created.body.id);

    const started = await s.pay(asha.token, created.body.id, 'khalti');
    expect(started.status).toBe(200);
    const pidx = pidxOf(started.body.redirectUrl);
    expect(ctx.gateways.calls[0]).toMatchObject({
      url: 'https://dev.khalti.com/api/v2/epayment/initiate/',
      json: { amount: 250_000, return_url: 'https://api.test.invalid/api/v1/payments/khalti/return' },
    });
    expect((await s.premiumNote(asha.token)).status).toBe(403);

    // The return address alone proves nothing: not paid yet → no access.
    let back = await s.khaltiReturn(pidx);
    expect(back.status).toBe(302);
    expect(back.headers['location']).toBe(`tayarikakshya://payment-result?order=${created.body.id}`);
    expect((await s.view(asha.token, created.body.id)).body.status).toBe('pending');
    expect((await s.premiumNote(asha.token)).status).toBe(403);

    ctx.gateways.khaltiPaid(pidx);
    back = await s.khaltiReturn(pidx);
    expect(back.status).toBe(302);
    const paid = (await s.view(asha.token, created.body.id)).body;
    expect(paid).toMatchObject({ status: 'paid', payments: [{ provider: 'khalti', status: 'completed' }] });
    expect((await s.premiumNote(asha.token)).status).toBe(200);
    const access = await ctx.prisma.entitlement.findFirstOrThrow({ where: { userId: asha.id } });
    expect(access).toMatchObject({ sourceType: 'order', sourceId: created.body.id, status: 'active' });
    const days = (access.endsAt!.getTime() - access.startsAt.getTime()) / (24 * 60 * MIN);
    expect(Math.round(days)).toBe(365);

    // Repeated callbacks change nothing: one access row, events kept.
    await s.khaltiReturn(pidx);
    await s.khaltiReturn(pidx);
    expect(await ctx.prisma.entitlement.count()).toBe(1);
    const events = await ctx.prisma.paymentEvent.findMany({ orderBy: { receivedAt: 'asc' } });
    expect(events.map((e) => e.result)).toEqual([
      'initiated',
      'pending',
      'completed',
      'unchanged',
      'unchanged',
    ]);
    expect(JSON.stringify(events)).not.toContain('test-khalti-key');

    // D-052: no buying again while access is active.
    const again = await s.order(asha.token);
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({
      code: 'PURCHASE_NOT_AVAILABLE',
      details: { reason: 'already_has_access' },
    });
    const mine = await call(ctx, 'GET', '/me/orders', { token: asha.token });
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({
      orderNo: 1,
      status: 'paid',
      items: [{ title: { en: 'Sainey Likhit' } }],
    });
    expect(await ctx.prisma.auditLog.count({ where: { action: 'order.paid' } })).toBe(1);
  });

  it('eSewa: signed form page, signed return confirmed by the status check, back to the website', async () => {
    const s = await setup();
    const asha = await s.student();
    const order = (await s.order(asha.token, undefined, { 'x-tk-platform': 'web' })).body;
    const started = await s.pay(asha.token, order.id, 'esewa', 'web');
    const paymentId = started.body.paymentId as string;
    expect(started.body.redirectUrl).toBe(
      `https://api.test.invalid/api/v1/payments/esewa/${paymentId}/start`,
    );

    const page = await call(ctx, 'GET', `/payments/esewa/${paymentId}/start`);
    expect(page.status).toBe(200);
    expect(page.headers['content-security-policy']).toContain('form-action https://rc-epay.esewa.com.np');
    expect(page.body).toContain('action="https://rc-epay.esewa.com.np/api/epay/main/v2/form"');
    expect(page.body).toContain(`name="transaction_uuid" value="${paymentId}"`);
    expect(page.body).toContain('name="total_amount" value="3000"');
    expect(page.body).not.toContain('test-esewa-secret');

    // A forged success (wrong key) is refused outright.
    const forged = FakeGateways.esewaSuccessData(paymentId, 300_000, 'not-the-key');
    expect((await call(ctx, 'GET', `/payments/esewa/return?data=${encodeURIComponent(forged)}`)).status).toBe(
      400,
    );
    expect(
      (await ctx.prisma.paymentEvent.findFirstOrThrow({ where: { result: 'rejected_signature' } })).paymentId,
    ).toBeNull();
    // A correctly signed redirect is still confirmed with eSewa: not paid there yet → nothing changes.
    const signed = FakeGateways.esewaSuccessData(paymentId, 300_000);
    await call(ctx, 'GET', `/payments/esewa/return?data=${encodeURIComponent(signed)}`);
    expect((await s.view(asha.token, order.id)).body.status).toBe('pending');

    ctx.gateways.esewaPaid(paymentId, 300_000);
    const back = await call(ctx, 'GET', `/payments/esewa/return?data=${encodeURIComponent(signed)}`);
    expect(back.status).toBe(302);
    expect(back.headers['location']).toBe(`https://web.test.invalid/payment-result?order=${order.id}`);
    expect((await s.view(asha.token, order.id)).body.status).toBe('paid');
    expect((await s.premiumNote(asha.token)).status).toBe(200);
    // The page cannot be used again once paid.
    expect((await call(ctx, 'GET', `/payments/esewa/${paymentId}/start`)).status).toBe(404);
  });

  it('cancelled, failed and expired attempts never grant access; the student can try again', async () => {
    const s = await setup();
    const asha = await s.student();
    const order = (await s.order(asha.token)).body;

    const first = pidxOf((await s.pay(asha.token, order.id, 'khalti')).body.redirectUrl);
    ctx.gateways.khalti.set(first, { status: 'User canceled', total_amount: 300_000, transaction_id: null });
    await s.khaltiReturn(first);
    expect((await s.view(asha.token, order.id)).body).toMatchObject({
      status: 'pending',
      payments: [{ status: 'cancelled' }],
    });

    const second = pidxOf((await s.pay(asha.token, order.id, 'khalti')).body.redirectUrl);
    ctx.gateways.khalti.set(second, { status: 'Expired', total_amount: 300_000, transaction_id: null });
    await s.khaltiReturn(second);

    // eSewa failure address: confirmed with eSewa (never paid → still open).
    const esewa = (await s.pay(asha.token, order.id, 'esewa')).body.paymentId as string;
    expect((await call(ctx, 'GET', `/payments/esewa/return?payment=${esewa}`)).status).toBe(302);
    expect((await s.premiumNote(asha.token)).status).toBe(403);

    const third = pidxOf((await s.pay(asha.token, order.id, 'khalti')).body.redirectUrl);
    ctx.gateways.khaltiPaid(third);
    await s.khaltiReturn(third);
    const done = (await s.view(asha.token, order.id)).body;
    expect(done.status).toBe('paid');
    expect(done.payments.map((p: { status: string }) => p.status)).toEqual([
      'completed',
      'pending',
      'expired',
      'cancelled',
    ]);
  });

  it('a different amount reported by the gateway never grants access and is flagged for staff', async () => {
    const s = await setup();
    const asha = await s.student();
    const order = (await s.order(asha.token)).body;
    const pidx = pidxOf((await s.pay(asha.token, order.id, 'khalti')).body.redirectUrl);
    ctx.gateways.khaltiPaid(pidx, 1_000);
    await s.khaltiReturn(pidx);
    expect((await s.view(asha.token, order.id)).body).toMatchObject({
      status: 'pending',
      payments: [{ status: 'failed' }],
    });
    expect((await s.premiumNote(asha.token)).status).toBe(403);
    const flagged = await call(ctx, 'GET', '/admin/orders?attention=true', { token: s.admin });
    expect(flagged.body.data).toHaveLength(1);
    expect(flagged.body.data[0]).toMatchObject({ orderNo: order.orderNo, attention: true });
    expect(await ctx.prisma.auditLog.count({ where: { action: 'payment.amount_mismatch' } })).toBe(1);
  });

  it('paid but never came back: settled when the order is viewed, or by the worker', async () => {
    const s = await setup();
    const asha = await s.student();
    const bina = await s.student('bina@example.com');

    // Asha pays and the app is closed; opening her order checks with Khalti.
    const a = (await s.order(asha.token)).body;
    const pidxA = pidxOf((await s.pay(asha.token, a.id, 'khalti')).body.redirectUrl);
    ctx.gateways.khaltiPaid(pidxA);
    expect((await s.view(asha.token, a.id)).body.status).toBe('paid');

    // Bina pays with eSewa and never opens the app again: the worker settles it.
    const b = (await s.order(bina.token)).body;
    const paymentB = (await s.pay(bina.token, b.id, 'esewa')).body.paymentId as string;
    ctx.gateways.esewaPaid(paymentB, 300_000);
    await ctx.prisma.payment.update({
      where: { id: paymentB },
      data: { initiatedAt: new Date(Date.now() - 5 * MIN) },
    });
    const result = await ctx.app.get(PaymentsService).reconcile();
    expect(result).toMatchObject({ checked: 1, settled: 1 });
    expect((await s.premiumNote(bina.token)).status).toBe(200);

    // An unpaid order times out; a payment eSewa never saw is closed after the grace period.
    const c = (await s.order((await s.student('chet@example.com')).token)).body;
    const chet = await ctx.prisma.order.findUniqueOrThrow({ where: { id: c.id } });
    const paymentC = await ctx.prisma.payment.create({
      data: {
        orderId: chet.id,
        provider: 'esewa',
        amountPaisa: chet.totalPaisa,
        returnTo: 'app',
        providerReference: 'x',
        initiatedAt: new Date(Date.now() - 3 * 60 * MIN),
      },
    });
    await ctx.prisma.order.update({
      where: { id: chet.id },
      data: { expiresAt: new Date(Date.now() - 2 * 60 * MIN) },
    });
    await ctx.app.get(PaymentsService).reconcile();
    expect((await ctx.prisma.payment.findUniqueOrThrow({ where: { id: paymentC.id } })).status).toBe(
      'expired',
    );
    await ctx.app.get(PaymentsService).reconcile();
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: chet.id } })).status).toBe('expired');
    // An expired order cannot be paid any more.
    const closed = await call(ctx, 'POST', `/orders/${c.id}/pay`, {
      token: (await registerStudent(ctx, 'dev@example.com')).accessToken,
      body: { provider: 'khalti', returnTo: 'app' },
    });
    expect(closed.status).toBe(404); // not Dev's order
  });

  it('two payments for one order (two devices): one access, the second flagged as a duplicate', async () => {
    const s = await setup();
    const asha = await s.student();
    const order = (await s.order(asha.token)).body;
    const one = pidxOf((await s.pay(asha.token, order.id, 'khalti')).body.redirectUrl);
    const two = pidxOf((await s.pay(asha.token, order.id, 'khalti')).body.redirectUrl);
    ctx.gateways.khaltiPaid(one);
    ctx.gateways.khaltiPaid(two);
    await Promise.all([s.khaltiReturn(one), s.khaltiReturn(two), s.khaltiReturn(one)]);
    const payments = await ctx.prisma.payment.findMany({ orderBy: { initiatedAt: 'asc' } });
    expect(payments.map((p) => p.status)).toEqual(['completed', 'completed']);
    expect(payments.filter((p) => p.duplicate)).toHaveLength(1);
    expect(await ctx.prisma.entitlement.count()).toBe(1);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'payment.duplicate' } })).toBe(1);
  });

  it('where purchases are allowed, which gateways, and gateway outages', async () => {
    const s = await setup();
    const asha = await s.student();
    // D-027: never on iOS; Android only when in-app checkout is on.
    const ios = await s.order(asha.token, undefined, { 'x-tk-platform': 'ios' });
    expect(ios.body.error.details.reason).toBe('channel_closed');
    expect(
      (
        await call(ctx, 'GET', '/payments/options', {
          token: asha.token,
          headers: { 'x-tk-platform': 'ios' },
        })
      ).body.providers,
    ).toEqual([]);
    await setSetting(ctx, 'purchase.channels', { android: 'web_only', ios: 'web_only', web: 'enabled' });
    expect((await s.order(asha.token)).body.error.details.reason).toBe('channel_closed');
    await setSetting(ctx, 'purchase.channels', { android: 'in_app', ios: 'web_only', web: 'enabled' });

    // Free courses are joined with Enrol.
    await call(ctx, 'PUT', `/admin/courses/${s.seeded.course.id}/pricing`, {
      token: s.admin,
      body: {
        pricePaisa: 0,
        salePricePaisa: null,
        saleStartsAt: null,
        saleEndsAt: null,
        validityType: 'lifetime',
        validityDays: null,
        validityEndsOn: null,
      },
    });
    expect((await s.order(asha.token)).body.error.details.reason).toBe('free_course');
    await call(ctx, 'PUT', `/admin/courses/${s.seeded.course.id}/pricing`, {
      token: s.admin,
      body: {
        pricePaisa: 300_000,
        salePricePaisa: null,
        saleStartsAt: null,
        saleEndsAt: null,
        validityType: 'days',
        validityDays: 30,
        validityEndsOn: null,
      },
    });

    const order = (await s.order(asha.token)).body;
    // A gateway switched off in the CMS.
    await setSetting(ctx, 'payments.providers', { esewa: true, khalti: false });
    const off = await s.pay(asha.token, order.id, 'khalti');
    expect(off.body.error.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
    await setSetting(ctx, 'payments.providers', { esewa: true, khalti: true });
    // Khalti unreachable: a clear error, the attempt recorded as failed.
    ctx.gateways.down = true;
    const down = await s.pay(asha.token, order.id, 'khalti');
    expect(down.status).toBe(502);
    expect(down.body.error.code).toBe('PAYMENT_GATEWAY_ERROR');
    expect((await ctx.prisma.payment.findFirstOrThrow()).failureReason).toBe('initiate_failed');
    // While a check fails, the order stays as it is.
    ctx.gateways.down = false;
    const pidx = pidxOf((await s.pay(asha.token, order.id, 'khalti')).body.redirectUrl);
    ctx.gateways.down = true;
    expect((await s.view(asha.token, order.id)).body.status).toBe('pending');
    ctx.gateways.down = false;
    ctx.gateways.khaltiPaid(pidx);
    // Views check again at most every few seconds.
    await ctx.prisma.payment.updateMany({ data: { lastCheckedAt: new Date(Date.now() - MIN) } });
    expect((await s.view(asha.token, order.id)).body.status).toBe('paid');
    // Unknown pidx: no redirect anywhere.
    expect((await s.khaltiReturn('pidx-nope')).status).toBe(400);
  });

  it('keeps orders private; staff see orders, payments and gateway events, and can check again', async () => {
    const s = await setup();
    const asha = await s.student();
    const bina = await s.student('bina@example.com');
    const order = (await s.order(asha.token)).body;
    const pidx = pidxOf((await s.pay(asha.token, order.id, 'khalti')).body.redirectUrl);
    expect((await s.view(bina.token, order.id)).status).toBe(404);
    expect((await s.pay(bina.token, order.id, 'khalti')).status).toBe(404);
    expect((await call(ctx, 'GET', '/admin/orders', { token: asha.token })).status).toBe(403);

    await createStaff(ctx, 'viewer@example.com', { permissions: ['orders:read'] });
    const viewer = (await staffLogin(ctx, 'viewer@example.com')).token;
    const list = await call(ctx, 'GET', `/admin/orders?q=asha`, { token: viewer });
    expect(list.body.data).toHaveLength(1);
    expect(
      (await call(ctx, 'GET', `/admin/orders?q=%23${order.orderNo}`, { token: viewer })).body.data,
    ).toHaveLength(1);
    const paymentId = (await ctx.prisma.payment.findFirstOrThrow()).id;
    expect((await call(ctx, 'POST', `/admin/payments/${paymentId}/check`, { token: viewer })).status).toBe(
      403,
    );

    // A student says they paid: staff check with Khalti.
    ctx.gateways.khaltiPaid(pidx);
    const checked = await call(ctx, 'POST', `/admin/payments/${paymentId}/check`, { token: s.admin });
    expect(checked.body).toEqual({ status: 'completed' });
    const detail = await call(ctx, 'GET', `/admin/orders/${order.id}`, { token: viewer });
    expect(detail.body).toMatchObject({
      status: 'paid',
      student: { fullName: 'Asha Rai' },
      access: [{ status: 'active' }],
      payments: [
        { provider: 'khalti', status: 'completed', providerReference: pidx, events: expect.any(Array) },
      ],
    });
    expect(detail.body.payments[0].events.map((e: { result: string }) => e.result)).toContain('completed');
    expect(await ctx.prisma.auditLog.count({ where: { action: 'payment.check' } })).toBe(1);

    // Revoking paid access (CMS) keeps the order and payment (D-052).
    const access = await ctx.prisma.entitlement.findFirstOrThrow();
    await call(ctx, 'POST', `/admin/entitlements/${access.id}/revoke`, {
      token: s.admin,
      body: { reason: 'Chargeback' },
    });
    expect((await s.premiumNote(asha.token)).status).toBe(403);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('paid');
  });
});
