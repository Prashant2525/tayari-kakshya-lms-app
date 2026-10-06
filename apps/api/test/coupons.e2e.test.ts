import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

const DAY = 86_400_000;
const ANDROID = { 'x-tk-platform': 'android' };
// Test values, not business values.
const coupon = (overrides: Record<string, unknown> = {}) => ({
  code: 'dashain-10',
  note: 'Festival offer',
  discountType: 'percent',
  percentBps: 1000,
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
  ...overrides,
});
const coursePricing = (overrides: Record<string, unknown> = {}) => ({
  pricePaisa: 300_000,
  salePricePaisa: null,
  saleStartsAt: null,
  saleEndsAt: null,
  validityType: 'days',
  validityDays: 365,
  validityEndsOn: null,
  ...overrides,
});

async function setup() {
  await createStaff(ctx, 'sales@example.com', {
    permissions: [...ALL_CONTENT_PERMISSIONS, 'coupons:manage', 'plans:manage', 'orders:read'],
  });
  const admin = (await staffLogin(ctx, 'sales@example.com')).token;
  // Rs 3,000 (seed).
  const seeded = await seedPublishedCourse(ctx, admin);
  const courseId = seeded.course.id;
  const makeCoupon = async (body = coupon()) => {
    const res = await call(ctx, 'POST', '/admin/coupons', { token: admin, body });
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    return res.body.id as string;
  };
  const student = async (email = 'asha@example.com') => {
    const tokens = await registerStudent(ctx, email);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    return { token: tokens.accessToken, id: user.id };
  };
  const quote = (token: string, body: Record<string, unknown>) =>
    call(ctx, 'POST', '/orders/quote', { token, body, headers: ANDROID });
  const order = (token: string, body: Record<string, unknown>) =>
    call(ctx, 'POST', '/orders', { token, body, headers: ANDROID });
  const premiumNote = (token: string) =>
    call(ctx, 'GET', `/learning-items/${seeded.premiumNote.id}`, { token });
  return { admin, seeded, courseId, makeCoupon, student, quote, order, premiumNote };
}

const reason = (res: {
  status: number;
  body: { error?: { code: string; details?: { reason?: string } } };
}) =>
  res.status === 422 && res.body.error?.code === 'COUPON_NOT_VALID'
    ? res.body.error.details?.reason
    : res.status;

describe('coupons (D-025, D-054, D-056)', () => {
  it('staff manage coupons; codes are case-insensitive and unique; changes are audited', async () => {
    const s = await setup();
    const id = await s.makeCoupon();
    const detail = await call(ctx, 'GET', `/admin/coupons/${id}`, { token: s.admin });
    expect(detail.body).toMatchObject({
      code: 'DASHAIN-10',
      percentBps: 1000,
      state: 'active',
      usedCount: 0,
    });
    expect(
      (await call(ctx, 'POST', '/admin/coupons', { token: s.admin, body: coupon({ code: 'DASHAIN-10' }) }))
        .status,
    ).toBe(409);
    // Shape rules: a percent coupon needs its percentage; a selected coupon needs something to apply to.
    expect(
      (
        await call(ctx, 'POST', '/admin/coupons', {
          token: s.admin,
          body: coupon({ code: 'X1X', percentBps: null }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(ctx, 'POST', '/admin/coupons', {
          token: s.admin,
          body: coupon({ code: 'X2X', appliesTo: 'selected' }),
        })
      ).status,
    ).toBe(400);
    expect(
      (await call(ctx, 'POST', '/admin/coupons', { token: s.admin, body: coupon({ code: 'bad code' }) }))
        .status,
    ).toBe(400);

    const updated = await call(ctx, 'PUT', `/admin/coupons/${id}`, {
      token: s.admin,
      body: coupon({ active: false }),
    });
    expect(updated.body).toMatchObject({ active: false, state: 'inactive' });
    const list = await call(ctx, 'GET', '/admin/coupons?q=dashain', { token: s.admin });
    expect(list.body.data).toHaveLength(1);
    const actions = (await ctx.prisma.auditLog.findMany({ where: { entityType: 'coupon' } })).map(
      (a) => a.action,
    );
    expect(actions.sort()).toEqual(['coupon.create', 'coupon.update']);

    await createStaff(ctx, 'editor@example.com', { permissions: ['courses:edit'] });
    const editor = (await staffLogin(ctx, 'editor@example.com')).token;
    expect((await call(ctx, 'GET', '/admin/coupons', { token: editor })).status).toBe(403);
  });

  it('checkout: the server applies the coupon, the gateway is asked for the discounted total, the order keeps it', async () => {
    const s = await setup();
    await s.makeCoupon(coupon({ maxDiscountPaisa: 20_000 }));
    const asha = await s.student();

    const q = await s.quote(asha.token, { courseId: s.courseId, couponCode: 'dashain-10' });
    expect(q.body).toMatchObject({
      kind: 'course',
      subtotalPaisa: 300_000,
      // 10% of Rs 3,000 is Rs 300, capped at Rs 200.
      discountPaisa: 20_000,
      coupon: { code: 'DASHAIN-10' },
      tax: null,
      totalPaisa: 280_000,
    });
    // A client cannot send its own discount.
    const o = await s.order(asha.token, {
      courseId: s.courseId,
      couponCode: 'Dashain-10',
      discountPaisa: 300_000,
    });
    expect(o.status).toBe(201);
    expect(o.body).toMatchObject({
      status: 'pending',
      subtotalPaisa: 300_000,
      discountPaisa: 20_000,
      couponCode: 'DASHAIN-10',
      totalPaisa: 280_000,
    });

    const started = await call(ctx, 'POST', `/orders/${o.body.id}/pay`, {
      token: asha.token,
      body: { provider: 'khalti', returnTo: 'app' },
    });
    const pidx = new URL(started.body.redirectUrl).searchParams.get('pidx')!;
    expect(ctx.gateways.khalti.get(pidx)!.total_amount).toBe(280_000);
    ctx.gateways.khaltiPaid(pidx);
    await call(ctx, 'GET', `/payments/khalti/return?pidx=${pidx}`);
    expect((await call(ctx, 'GET', `/orders/${o.body.id}`, { token: asha.token })).body.status).toBe('paid');
    expect((await s.premiumNote(asha.token)).status).toBe(200);
    const admin = await call(ctx, 'GET', `/admin/orders/${o.body.id}`, { token: s.admin });
    expect(admin.body).toMatchObject({
      couponCode: 'DASHAIN-10',
      discountPaisa: 20_000,
      totalPaisa: 280_000,
    });

    // Without a coupon the unpaid order is not reused with a different total.
    const bimal = await s.student('bimal@example.com');
    const first = await s.order(bimal.token, { courseId: s.courseId, couponCode: 'DASHAIN-10' });
    const again = await s.order(bimal.token, { courseId: s.courseId, couponCode: 'DASHAIN-10' });
    expect(again.body.id).toBe(first.body.id);
    const plain = await s.order(bimal.token, { courseId: s.courseId });
    expect(plain.body).toMatchObject({ totalPaisa: 300_000, couponCode: null });
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: first.body.id } })).status).toBe(
      'cancelled',
    );
  });

  it('refuses coupons that do not apply, with the reason', async () => {
    const s = await setup();
    const asha = await s.student();
    const now = Date.now();
    const forCourse = (code: string) => s.quote(asha.token, { courseId: s.courseId, couponCode: code });

    expect(reason(await forCourse('NOPE'))).toBe('not_found');
    await s.makeCoupon(coupon({ code: 'OFF', active: false }));
    expect(reason(await forCourse('OFF'))).toBe('inactive');
    await s.makeCoupon(coupon({ code: 'LATER', startsAt: new Date(now + DAY).toISOString() }));
    expect(reason(await forCourse('LATER'))).toBe('not_started');
    await s.makeCoupon(
      coupon({
        code: 'OVER',
        startsAt: new Date(now - 2 * DAY).toISOString(),
        endsAt: new Date(now - DAY).toISOString(),
      }),
    );
    expect(reason(await forCourse('OVER'))).toBe('ended');
    await s.makeCoupon(coupon({ code: 'PLANS', appliesTo: 'all_plans' }));
    expect(reason(await forCourse('PLANS'))).toBe('not_applicable');
    await s.makeCoupon(coupon({ code: 'BIG', minOrderPaisa: 500_000 }));
    expect(reason(await forCourse('BIG'))).toBe('below_minimum');

    // D-054: off by default during a sale; when on, the discount is taken from the sale price.
    await call(ctx, 'PUT', `/admin/courses/${s.courseId}/pricing`, {
      token: s.admin,
      body: coursePricing({ salePricePaisa: 250_000 }),
    });
    await s.makeCoupon(coupon({ code: 'NOSALE' }));
    expect(reason(await forCourse('NOSALE'))).toBe('on_sale');
    await s.makeCoupon(coupon({ code: 'SALEOK', allowOnSale: true }));
    expect((await forCourse('SALEOK')).body).toMatchObject({
      subtotalPaisa: 250_000,
      regularPricePaisa: 300_000,
      discountPaisa: 25_000,
      totalPaisa: 225_000,
    });
    // Creating the order refuses the same way.
    expect(reason(await s.order(asha.token, { courseId: s.courseId, couponCode: 'NOSALE' }))).toBe('on_sale');
  });

  it('limits: unpaid orders hold a use while they can be paid; per-student limit', async () => {
    const s = await setup();
    await s.makeCoupon(coupon({ code: 'ONE', maxRedemptions: 1 }));
    await s.makeCoupon(coupon({ code: 'MINE', perUserLimit: 1, appliesTo: 'all_courses' }));
    const asha = await s.student();
    const bimal = await s.student('bimal@example.com');

    const held = await s.order(asha.token, { courseId: s.courseId, couponCode: 'ONE' });
    expect(held.status).toBe(201);
    expect(reason(await s.order(bimal.token, { courseId: s.courseId, couponCode: 'ONE' }))).toBe('used_up');
    // Asha's order runs out unpaid: the use comes back.
    await ctx.prisma.order.update({
      where: { id: held.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await s.order(bimal.token, { courseId: s.courseId, couponCode: 'ONE' })).status).toBe(201);

    // Asha renews her choice with the same coupon: her own unpaid order does not count against her.
    const mine = await s.order(asha.token, { courseId: s.courseId, couponCode: 'MINE' });
    expect(mine.status).toBe(201);
    expect((await s.order(asha.token, { courseId: s.courseId, couponCode: 'MINE' })).body.id).toBe(
      mine.body.id,
    );
    await ctx.prisma.order.update({
      where: { id: mine.body.id },
      data: { status: 'paid', paidAt: new Date() },
    });
    await ctx.prisma.entitlement.deleteMany({ where: { userId: asha.id } });
    expect(reason(await s.quote(asha.token, { courseId: s.courseId, couponCode: 'MINE' }))).toBe(
      'already_used',
    );
  });

  it('a coupon that leaves nothing to pay gives access at once, with no payment (D-056)', async () => {
    const s = await setup();
    await s.makeCoupon(coupon({ code: 'FREE', percentBps: 10_000 }));
    // A fixed amount above the price is capped at the price.
    await s.makeCoupon(
      coupon({ code: 'GIFT', discountType: 'fixed', percentBps: null, amountPaisa: 999_900 }),
    );
    const asha = await s.student();
    expect((await s.quote(asha.token, { courseId: s.courseId, couponCode: 'GIFT' })).body.totalPaisa).toBe(0);

    const o = await s.order(asha.token, { courseId: s.courseId, couponCode: 'FREE' });
    expect(o.body).toMatchObject({ status: 'paid', discountPaisa: 300_000, totalPaisa: 0, payments: [] });
    expect((await s.premiumNote(asha.token)).status).toBe(200);
    expect(
      (
        await call(ctx, 'POST', `/orders/${o.body.id}/pay`, {
          token: asha.token,
          body: { provider: 'khalti', returnTo: 'app' },
        })
      ).status,
    ).toBe(409);
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: 'order.paid', entityId: o.body.id },
    });
    expect(audit.changes).toMatchObject({ amountPaisa: 0, coupon: 'FREE', free: true });
    // D-052 still holds: no second order while access is active.
    expect(
      (await s.order(asha.token, { courseId: s.courseId, couponCode: 'GIFT' })).body.error.details.reason,
    ).toBe('already_has_access');
  });

  it('applies to the chosen courses and plans only', async () => {
    const s = await setup();
    const plan = await call(ctx, 'POST', '/admin/plans', {
      token: s.admin,
      body: {
        slug: 'yearly',
        name: { en: 'Yearly' },
        description: null,
        features: [],
        coverage: 'all_courses',
        isFeatured: false,
        sortOrder: 0,
      },
    });
    await call(ctx, 'PUT', `/admin/plans/${plan.body.id}/pricing`, {
      token: s.admin,
      body: coursePricing({ pricePaisa: 800_000 }),
    });
    await call(ctx, 'PUT', `/admin/plans/${plan.body.id}/status`, {
      token: s.admin,
      body: { status: 'published' },
    });
    await s.makeCoupon(coupon({ code: 'PLANONLY', appliesTo: 'selected', planIds: [plan.body.id] }));
    const asha = await s.student();
    expect(reason(await s.quote(asha.token, { courseId: s.courseId, couponCode: 'PLANONLY' }))).toBe(
      'not_applicable',
    );
    expect((await s.quote(asha.token, { planId: plan.body.id, couponCode: 'PLANONLY' })).body).toMatchObject({
      kind: 'plan',
      discountPaisa: 80_000,
      totalPaisa: 720_000,
    });
  });
});

describe('VAT (D-055)', () => {
  it('not registered: no VAT; registered with inclusive prices: the total is unchanged and contains the VAT', async () => {
    const s = await setup();
    const asha = await s.student();
    await call(ctx, 'PUT', `/admin/courses/${s.courseId}/pricing`, {
      token: s.admin,
      body: coursePricing({ pricePaisa: 113_000 }),
    });
    expect((await s.quote(asha.token, { courseId: s.courseId })).body).toMatchObject({
      tax: null,
      totalPaisa: 113_000,
    });

    await setSetting(ctx, 'commerce.tax', {
      vatRegistered: true,
      rateBps: 1300,
      pricesIncludeVat: true,
      businessName: 'Test Business',
      panNumber: '123456789',
      address: '',
    });
    const inclusive = await s.order(asha.token, { courseId: s.courseId });
    // Rs 1,130 including 13% VAT = Rs 1,000 + Rs 130.
    expect(inclusive.body).toMatchObject({
      totalPaisa: 113_000,
      tax: { rateBps: 1300, inclusive: true, paisa: 13_000 },
    });
  });

  it('registered with prices before VAT: VAT is added on top of the price after the coupon', async () => {
    const s = await setup();
    await setSetting(ctx, 'commerce.tax', {
      vatRegistered: true,
      rateBps: 1300,
      pricesIncludeVat: false,
      businessName: 'Test Business',
      panNumber: '123456789',
      address: '',
    });
    await s.makeCoupon(coupon({ code: 'HALF', percentBps: 5000 }));
    const asha = await s.student();
    const o = await s.order(asha.token, { courseId: s.courseId, couponCode: 'HALF' });
    // Rs 3,000 − Rs 1,500 = Rs 1,500 + 13% VAT (Rs 195) = Rs 1,695.
    expect(o.body).toMatchObject({
      subtotalPaisa: 300_000,
      discountPaisa: 150_000,
      tax: { inclusive: false, paisa: 19_500 },
      totalPaisa: 169_500,
    });
    const started = await call(ctx, 'POST', `/orders/${o.body.id}/pay`, {
      token: asha.token,
      body: { provider: 'khalti', returnTo: 'app' },
    });
    const pidx = new URL(started.body.redirectUrl).searchParams.get('pidx')!;
    expect(ctx.gateways.khalti.get(pidx)!.total_amount).toBe(169_500);
  });

  it('the CMS refuses VAT registration without the PAN / VAT number and business name', async () => {
    await createStaff(ctx, 'owner@example.com', { permissions: ['settings:read', 'settings:update'] });
    const token = (await staffLogin(ctx, 'owner@example.com')).token;
    const value = {
      vatRegistered: true,
      rateBps: 1300,
      pricesIncludeVat: true,
      businessName: '',
      panNumber: '',
      address: '',
    };
    expect((await call(ctx, 'PUT', '/admin/settings/commerce.tax', { token, body: { value } })).status).toBe(
      400,
    );
    expect(
      (
        await call(ctx, 'PUT', '/admin/settings/commerce.tax', {
          token,
          body: { value: { ...value, panNumber: '12345' } },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(ctx, 'PUT', '/admin/settings/commerce.tax', {
          token,
          body: { value: { ...value, businessName: 'Tayari', panNumber: '123456789' } },
        })
      ).status,
    ).toBe(200);
  });
});
