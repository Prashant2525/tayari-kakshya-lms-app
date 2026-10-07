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

const ANDROID = { 'x-tk-platform': 'android' };
let deviceNo = 0;
const device = () => ({
  deviceId: `test-device-${(deviceNo += 1)}`,
  deviceName: 'Test',
  platform: 'android',
});
// Test values, not business values.
const RULES = {
  enabled: true,
  friendDiscount: {
    type: 'percent',
    percentBps: 1000,
    amountPaisa: null,
    maxDiscountPaisa: null,
    allowOnSale: false,
  },
  reward: {
    type: 'fixed',
    percentBps: null,
    amountPaisa: 30_000,
    maxDiscountPaisa: null,
    validDays: 30,
    allowOnSale: false,
  },
};
const pricing = (overrides: Record<string, unknown> = {}) => ({
  pricePaisa: 300_000,
  salePricePaisa: null,
  saleStartsAt: null,
  saleEndsAt: null,
  validityType: 'lifetime',
  validityDays: null,
  validityEndsOn: null,
  ...overrides,
});
const coupon = (code: string, percentBps: number) => ({
  code,
  note: null,
  discountType: 'percent',
  percentBps,
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
});

async function setup(rules: unknown = RULES) {
  await setSetting(ctx, 'referrals.rules', rules);
  await createStaff(ctx, 'sales@example.com', {
    permissions: [
      ...ALL_CONTENT_PERMISSIONS,
      'coupons:manage',
      'orders:read',
      'refunds:request',
      'refunds:approve',
    ],
  });
  const admin = (await staffLogin(ctx, 'sales@example.com')).token;
  // Rs 3,000 (seed).
  const seeded = await seedPublishedCourse(ctx, admin);
  const courseId = seeded.course.id;
  const second = await call(ctx, 'POST', '/admin/courses', {
    token: admin,
    body: { slug: 'second', title: { en: 'Second' } },
  });
  await call(ctx, 'PUT', `/admin/courses/${second.body.id}/pricing`, { token: admin, body: pricing() });
  await call(ctx, 'PUT', `/admin/courses/${second.body.id}/subjects`, {
    token: admin,
    body: { subjects: [{ subjectId: seeded.subject.id }] },
  });
  await call(ctx, 'PUT', `/admin/courses/${second.body.id}/publishing`, {
    token: admin,
    body: { status: 'published' },
  });
  const signUp = (email: string, referralCode?: string) =>
    call(ctx, 'POST', '/auth/register', {
      body: {
        fullName: 'Friend',
        email,
        password: 'a good password',
        acceptTerms: true,
        device: device(),
        ...(referralCode ? { referralCode } : {}),
      },
    });
  const quote = (token: string, body: Record<string, unknown>) =>
    call(ctx, 'POST', '/orders/quote', { token, body, headers: ANDROID });
  /** Buys through Khalti (answered by the test gateway); returns the paid order. */
  const buy = async (token: string, body: Record<string, unknown>) => {
    const order = await call(ctx, 'POST', '/orders', { token, body, headers: ANDROID });
    if (order.status !== 201) throw new Error(JSON.stringify(order.body));
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
  return { admin, seeded, courseId, secondId: second.body.id as string, signUp, quote, buy };
}

describe('referrals (D-058, D-059)', () => {
  it('a friend who signs up with the code gets the discount on the first purchase; the referrer gets a reward coupon', async () => {
    const s = await setup();
    const asha = (await registerStudent(ctx, 'asha@example.com')).accessToken;
    const mine = await call(ctx, 'GET', '/me/referral', { token: asha });
    expect(mine.body).toMatchObject({
      enabled: true,
      code: expect.stringMatching(/^[A-Z0-9]{8}$/),
      friendDiscount: { type: 'percent', percentBps: 1000 },
      reward: { type: 'fixed', amountPaisa: 30_000, validDays: 30 },
      joined: 0,
      rewards: [],
    });
    // The same code every time.
    expect((await call(ctx, 'GET', '/me/referral', { token: asha })).body.code).toBe(mine.body.code);

    // An unknown code is refused at sign-up (and no account is made); the right one, in any case, works.
    const wrong = await s.signUp('bimal@example.com', 'NOSUCHCODE');
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.code).toBe('REFERRAL_CODE_NOT_VALID');
    expect(await ctx.prisma.user.count({ where: { email: 'bimal@example.com' } })).toBe(0);
    const bimal = (await s.signUp('bimal@example.com', mine.body.code.toLowerCase())).body
      .accessToken as string;

    const q = await s.quote(bimal, { courseId: s.courseId });
    expect(q.body).toMatchObject({
      discountPaisa: 30_000,
      referral: { discountPaisa: 30_000 },
      coupon: null,
      totalPaisa: 270_000,
    });

    const paid = await s.buy(bimal, { courseId: s.courseId });
    expect(paid).toMatchObject({ status: 'paid', totalPaisa: 270_000, referralDiscount: true });
    const referral = await ctx.prisma.referral.findFirstOrThrow({ include: { rewardCoupon: true } });
    expect(referral).toMatchObject({ status: 'rewarded', firstOrderId: paid.id });
    expect(referral.rewardCoupon).toMatchObject({
      amountPaisa: 30_000,
      maxRedemptions: 1,
      perUserLimit: 1,
      active: true,
    });
    const after = await call(ctx, 'GET', '/me/referral', { token: asha });
    expect(after.body).toMatchObject({
      joined: 1,
      rewarded: 1,
      rewards: [{ code: referral.rewardCoupon!.code, state: 'available' }],
    });

    // Only the first purchase: the next one has no referral discount.
    expect((await s.quote(bimal, { courseId: s.secondId })).body).toMatchObject({
      referral: null,
      totalPaisa: 300_000,
    });

    // The reward belongs to Asha: for Bimal it does not exist; for Asha it takes Rs 300 off.
    const rewardCode = referral.rewardCoupon!.code;
    expect(
      (await s.quote(bimal, { courseId: s.secondId, couponCode: rewardCode })).body.error.details.reason,
    ).toBe('not_found');
    expect((await s.quote(asha, { courseId: s.secondId, couponCode: rewardCode })).body).toMatchObject({
      discountPaisa: 30_000,
    });

    const actions = (await ctx.prisma.auditLog.findMany({ where: { entityType: 'referral' } })).map(
      (a) => a.action,
    );
    expect(actions.sort()).toEqual(['referral.join', 'referral.reward']);
    const list = await call(ctx, 'GET', '/admin/referrals', { token: s.admin });
    expect(list.body.data[0]).toMatchObject({
      status: 'rewarded',
      firstOrder: { id: paid.id },
      rewardCoupon: { code: rewardCode },
    });
  });

  it('one discount per order: the bigger of the referral discount and a coupon (a tie applies the referral and leaves the coupon for later)', async () => {
    const s = await setup();
    await call(ctx, 'POST', '/admin/coupons', { token: s.admin, body: coupon('BIG20', 2000) });
    await call(ctx, 'POST', '/admin/coupons', { token: s.admin, body: coupon('SMALL5', 500) });
    await call(ctx, 'POST', '/admin/coupons', { token: s.admin, body: coupon('SAME10', 1000) });
    const asha = (await registerStudent(ctx, 'asha@example.com')).accessToken;
    const code = (await call(ctx, 'GET', '/me/referral', { token: asha })).body.code as string;
    const bimal = (await s.signUp('bimal@example.com', code)).body.accessToken as string;

    expect((await s.quote(bimal, { courseId: s.courseId, couponCode: 'BIG20' })).body).toMatchObject({
      coupon: { code: 'BIG20' },
      referral: null,
      discountPaisa: 60_000,
    });
    expect((await s.quote(bimal, { courseId: s.courseId, couponCode: 'SMALL5' })).body).toMatchObject({
      coupon: null,
      referral: { discountPaisa: 30_000 },
      couponSkipped: 'SMALL5',
    });
    expect((await s.quote(bimal, { courseId: s.courseId, couponCode: 'SAME10' })).body).toMatchObject({
      referral: { discountPaisa: 30_000 },
      couponSkipped: 'SAME10',
    });
    // An invalid coupon is still explained.
    expect(
      (await s.quote(bimal, { courseId: s.courseId, couponCode: 'NOPE' })).body.error.details.reason,
    ).toBe('not_found');

    // Paying with the bigger coupon uses up the first purchase: the referrer is not rewarded for it (no referral used).
    const paid = await s.buy(bimal, { courseId: s.courseId, couponCode: 'BIG20' });
    expect(paid).toMatchObject({ couponCode: 'BIG20', referralDiscount: false });
    expect((await ctx.prisma.referral.findFirstOrThrow()).status).toBe('joined');
  });

  it('a full refund of the first purchase switches off an unused reward', async () => {
    const s = await setup();
    const asha = (await registerStudent(ctx, 'asha@example.com')).accessToken;
    const code = (await call(ctx, 'GET', '/me/referral', { token: asha })).body.code as string;
    const bimal = (await s.signUp('bimal@example.com', code)).body.accessToken as string;
    const paid = await s.buy(bimal, { courseId: s.courseId });
    const requested = await call(ctx, 'POST', `/admin/orders/${paid.id}/refunds`, {
      token: s.admin,
      body: { amountPaisa: 270_000, reason: 'Wrong course' },
    });
    await call(ctx, 'POST', `/admin/refunds/${requested.body.id}/approve`, {
      token: s.admin,
      body: { note: null },
    });
    const referral = await ctx.prisma.referral.findFirstOrThrow({ include: { rewardCoupon: true } });
    expect(referral.status).toBe('cancelled');
    expect(referral.rewardCoupon!.active).toBe(false);
    expect((await call(ctx, 'GET', '/me/referral', { token: asha })).body.rewards[0].state).toBe('cancelled');
  });

  it('a reward already used stays used when the friend is refunded', async () => {
    const s = await setup();
    const asha = (await registerStudent(ctx, 'asha@example.com')).accessToken;
    const code = (await call(ctx, 'GET', '/me/referral', { token: asha })).body.code as string;
    const bimal = (await s.signUp('bimal@example.com', code)).body.accessToken as string;
    const paid = await s.buy(bimal, { courseId: s.courseId });
    const reward = (await ctx.prisma.coupon.findFirstOrThrow({ where: { ownerUserId: { not: null } } })).code;
    await s.buy(asha, { courseId: s.courseId, couponCode: reward });
    const requested = await call(ctx, 'POST', `/admin/orders/${paid.id}/refunds`, {
      token: s.admin,
      body: { amountPaisa: 270_000, reason: 'Wrong course' },
    });
    await call(ctx, 'POST', `/admin/refunds/${requested.body.id}/approve`, {
      token: s.admin,
      body: { note: null },
    });
    expect((await ctx.prisma.referral.findFirstOrThrow()).status).toBe('rewarded');
    expect((await call(ctx, 'GET', '/me/referral', { token: asha })).body.rewards[0].state).toBe('used');
  });

  it('off: the code is ignored and nothing is offered; the sale switch decides sale prices', async () => {
    const s = await setup({ ...RULES, enabled: false });
    const asha = (await registerStudent(ctx, 'asha@example.com')).accessToken;
    expect((await call(ctx, 'GET', '/me/referral', { token: asha })).body).toMatchObject({
      enabled: false,
      code: null,
    });
    expect((await call(ctx, 'GET', '/app/config')).body.referrals).toEqual({ enabled: false });
    expect((await s.signUp('bimal@example.com', 'ANYCODE1')).status).toBe(201);
    expect(await ctx.prisma.referral.count()).toBe(0);

    await setSetting(ctx, 'referrals.rules', RULES);
    const code = (await call(ctx, 'GET', '/me/referral', { token: asha })).body.code as string;
    const chandra = (await s.signUp('chandra@example.com', code)).body.accessToken as string;
    await call(ctx, 'PUT', `/admin/courses/${s.courseId}/pricing`, {
      token: s.admin,
      body: pricing({ salePricePaisa: 250_000 }),
    });
    expect((await s.quote(chandra, { courseId: s.courseId })).body).toMatchObject({
      referral: null,
      totalPaisa: 250_000,
    });
    await setSetting(ctx, 'referrals.rules', {
      ...RULES,
      friendDiscount: { ...RULES.friendDiscount, allowOnSale: true },
    });
    expect((await s.quote(chandra, { courseId: s.courseId })).body).toMatchObject({
      referral: { discountPaisa: 25_000 },
    });
  });

  it('the CMS refuses switching the programme on without both discounts', async () => {
    await createStaff(ctx, 'owner@example.com', { permissions: ['settings:read', 'settings:update'] });
    const token = (await staffLogin(ctx, 'owner@example.com')).token;
    const off = {
      ...RULES,
      friendDiscount: { ...RULES.friendDiscount, percentBps: null },
    };
    expect(
      (await call(ctx, 'PUT', '/admin/settings/referrals.rules', { token, body: { value: off } })).status,
    ).toBe(400);
    expect(
      (await call(ctx, 'PUT', '/admin/settings/referrals.rules', { token, body: { value: RULES } })).status,
    ).toBe(200);
  });
});
