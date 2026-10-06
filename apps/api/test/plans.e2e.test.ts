import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALL_CONTENT_PERMISSIONS, seedPublishedCourse } from './content-helpers.js';
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
const ANDROID = { 'x-tk-platform': 'android' };
// Test prices and wording, not business values.
const planBody = (overrides: Record<string, unknown> = {}) => ({
  slug: 'premium',
  name: { en: 'Premium', ne: 'प्रिमियम' },
  description: { en: 'Every course in the plan' },
  features: [{ en: 'All premium notes' }, { en: 'Mock tests' }],
  coverage: 'selected',
  isFeatured: true,
  sortOrder: 1,
  ...overrides,
});
const pricing = (overrides: Record<string, unknown> = {}) => ({
  pricePaisa: 500_000,
  salePricePaisa: null,
  saleStartsAt: null,
  saleEndsAt: null,
  validityType: 'days',
  validityDays: 30,
  validityEndsOn: null,
  ...overrides,
});

async function setup() {
  await createStaff(ctx, 'plans@example.com', {
    permissions: [...ALL_CONTENT_PERMISSIONS, 'plans:manage', 'orders:read'],
  });
  const admin = (await staffLogin(ctx, 'plans@example.com')).token;
  const seeded = await seedPublishedCourse(ctx, admin);
  const plan = async (body = planBody(), price = pricing(), courseIds = [seeded.course.id]) => {
    const created = await call(ctx, 'POST', '/admin/plans', { token: admin, body });
    if (created.status !== 201) throw new Error(JSON.stringify(created.body));
    const id = created.body.id as string;
    await call(ctx, 'PUT', `/admin/plans/${id}/pricing`, { token: admin, body: price });
    await call(ctx, 'PUT', `/admin/plans/${id}/courses`, { token: admin, body: { courseIds } });
    const published = await call(ctx, 'PUT', `/admin/plans/${id}/status`, {
      token: admin,
      body: { status: 'published' },
    });
    if (published.status !== 200) throw new Error(JSON.stringify(published.body));
    return id;
  };
  const student = async (email = 'asha@example.com') => {
    const tokens = await registerStudent(ctx, email);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    return { token: tokens.accessToken, id: user.id };
  };
  /** Buys a plan through Khalti (answered by the test gateway). */
  const buyPlan = async (token: string, planId: string) => {
    const order = await call(ctx, 'POST', '/orders', { token, body: { planId }, headers: ANDROID });
    if (order.status !== 201) return order;
    const started = await call(ctx, 'POST', `/orders/${order.body.id}/pay`, {
      token,
      body: { provider: 'khalti', returnTo: 'app' },
    });
    const pidx = new URL(started.body.redirectUrl).searchParams.get('pidx')!;
    ctx.gateways.khaltiPaid(pidx);
    await call(ctx, 'GET', `/payments/khalti/return?pidx=${pidx}`);
    return call(ctx, 'GET', `/orders/${order.body.id}`, { token });
  };
  const premiumNote = (token: string) =>
    call(ctx, 'GET', `/learning-items/${seeded.premiumNote.id}`, { token });
  return { admin, seeded, plan, student, buyPlan, premiumNote };
}

describe('plans (D-023, D-054)', () => {
  it('staff write, price and publish a plan; students see it with the price where their platform sells', async () => {
    const s = await setup();
    const id = await s.plan(planBody(), pricing({ salePricePaisa: 400_000 }));
    expect((await call(ctx, 'POST', '/admin/plans', { token: s.admin, body: planBody() })).status).toBe(409);
    expect(
      (
        await call(ctx, 'PUT', `/admin/plans/${id}/pricing`, {
          token: s.admin,
          body: pricing({ salePricePaisa: 600_000 }),
        })
      ).status,
    ).toBe(400);

    const android = await call(ctx, 'GET', '/plans', { headers: ANDROID });
    expect(android.body).toHaveLength(1);
    expect(android.body[0]).toMatchObject({
      slug: 'premium',
      features: [{ en: 'All premium notes' }, { en: 'Mock tests' }],
      courses: [{ id: s.seeded.course.id, slug: 'sainey-likhit' }],
      pricing: { pricePaisa: 500_000, salePricePaisa: 400_000, effectivePricePaisa: 400_000 },
      validity: { type: 'days', days: 30 },
      mine: null,
    });
    expect(
      (await call(ctx, 'GET', '/plans', { headers: { 'x-tk-platform': 'ios' } })).body[0].pricing,
    ).toBeNull();

    const list = await call(ctx, 'GET', '/admin/plans', { token: s.admin });
    expect(list.body[0]).toMatchObject({ status: 'published', courseCount: 1, activeSubscribers: 0 });
    const actions = (await ctx.prisma.auditLog.findMany({ where: { entityType: 'plan' } })).map(
      (a) => a.action,
    );
    expect(actions.sort()).toEqual(['plan.courses', 'plan.create', 'plan.pricing', 'plan.status'].sort());

    // Course editors without plans:manage cannot touch plans.
    await createStaff(ctx, 'editor@example.com', { permissions: ['courses:edit'] });
    const editor = (await staffLogin(ctx, 'editor@example.com')).token;
    expect((await call(ctx, 'GET', '/admin/plans', { token: editor })).status).toBe(403);
  });

  it('a bought plan opens its courses (premium included) while active; course purchases it covers are refused', async () => {
    const s = await setup();
    const id = await s.plan();
    const asha = await s.student();
    expect((await s.premiumNote(asha.token)).status).toBe(403);

    const paid = await s.buyPlan(asha.token, id);
    expect(paid.body).toMatchObject({
      status: 'paid',
      items: [{ kind: 'plan', planId: id, title: { en: 'Premium' } }],
    });
    expect((await s.premiumNote(asha.token)).status).toBe(200);
    const mine = (await call(ctx, 'GET', '/me/courses', { token: asha.token })).body;
    expect(mine.map((c: { id: string }) => c.id)).toEqual([s.seeded.course.id]);
    const course = await call(ctx, 'GET', '/courses/sainey-likhit', { token: asha.token });
    expect(course.body.access).toMatchObject({ entitled: true });
    const order = await call(ctx, 'POST', '/orders', {
      token: asha.token,
      body: { courseId: s.seeded.course.id },
      headers: ANDROID,
    });
    expect(order.body.error.details.reason).toBe('already_has_access');
    const plans = await call(ctx, 'GET', '/plans', { token: asha.token, headers: ANDROID });
    expect(plans.body[0].mine.endsAt).not.toBeNull();

    // When the plan ends, access ends with it.
    await ctx.prisma.entitlement.updateMany({
      where: { scopeType: 'plan' },
      data: { startsAt: new Date(Date.now() - 40 * DAY), endsAt: new Date(Date.now() - 1000) },
    });
    expect((await s.premiumNote(asha.token)).status).toBe(403);
  });

  it('follows the plan as it changes: courses added or removed apply to current subscribers', async () => {
    const s = await setup();
    const id = await s.plan(planBody(), pricing(), []);
    const asha = await s.student();
    await s.buyPlan(asha.token, id);
    expect((await s.premiumNote(asha.token)).status).toBe(403);
    await call(ctx, 'PUT', `/admin/plans/${id}/courses`, {
      token: s.admin,
      body: { courseIds: [s.seeded.course.id] },
    });
    expect((await s.premiumNote(asha.token)).status).toBe(200);
    await call(ctx, 'PUT', `/admin/plans/${id}/courses`, { token: s.admin, body: { courseIds: [] } });
    expect((await s.premiumNote(asha.token)).status).toBe(403);

    // An all-courses plan covers every course, including new ones.
    await call(ctx, 'PUT', `/admin/plans/${id}`, {
      token: s.admin,
      body: planBody({ coverage: 'all_courses' }),
    });
    expect((await s.premiumNote(asha.token)).status).toBe(200);
  });

  it('renewing extends a days plan; lifetime and free plans cannot be bought again or at all', async () => {
    const s = await setup();
    const id = await s.plan();
    const asha = await s.student();
    await s.buyPlan(asha.token, id);
    const renewed = await s.buyPlan(asha.token, id);
    expect(renewed.body.status).toBe('paid');
    const rows = await ctx.prisma.entitlement.findMany({
      where: { scopeType: 'plan' },
      orderBy: { startsAt: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]!.startsAt.getTime()).toBe(rows[0]!.endsAt!.getTime());
    expect(Math.round((rows[1]!.endsAt!.getTime() - Date.now()) / DAY)).toBe(60);

    const lifetime = await s.plan(
      planBody({ slug: 'forever' }),
      pricing({ validityType: 'lifetime', validityDays: null }),
    );
    await s.buyPlan(asha.token, lifetime);
    const again = await call(ctx, 'POST', '/orders', {
      token: asha.token,
      body: { planId: lifetime },
      headers: ANDROID,
    });
    expect(again.body.error.details.reason).toBe('already_has_access');

    const free = await s.plan(
      planBody({ slug: 'free' }),
      pricing({ pricePaisa: 0, validityType: 'lifetime', validityDays: null }),
    );
    const freeOrder = await call(ctx, 'POST', '/orders', {
      token: asha.token,
      body: { planId: free },
      headers: ANDROID,
    });
    expect(freeOrder.body.error.details.reason).toBe('not_for_sale');
    expect(
      (await call(ctx, 'POST', '/orders', { token: asha.token, body: {}, headers: ANDROID })).status,
    ).toBe(400);
  });

  it('opens "plans only" Premium tests to plan holders (D-048)', async () => {
    const s = await setup();
    const id = await s.plan();
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
            en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes?' }] }] },
          },
          correct: true,
        },
      },
    });
    await call(ctx, 'PUT', `/admin/questions/${q.body.id}/status`, {
      token: s.admin,
      body: { status: 'published' },
    });
    const test = await call(ctx, 'POST', '/admin/assessments', {
      token: s.admin,
      body: {
        type: 'quiz',
        title: { en: 'Plan quiz' },
        accessLevel: 'premium',
        premiumAccess: 'plans_only',
        availability: 'always',
        durationMinutes: 5,
        maxAttempts: null,
        passMarks: null,
        scoring: {
          negativeMarking: false,
          multipleChoice: 'all_or_nothing',
          match: 'all_or_nothing',
          fillBlank: 'all_or_nothing',
          scoreFloor: 'zero',
        },
        shuffleQuestions: false,
        shuffleOptions: false,
        resultRelease: 'immediate',
        showExplanations: true,
        leaderboardEnabled: false,
        subjectiveGrading: 'none',
      },
    });
    if (test.status !== 201) throw new Error(JSON.stringify(test.body));
    await call(ctx, 'PUT', `/admin/assessments/${test.body.id}/structure`, {
      token: s.admin,
      body: { sections: [{ pickMode: 'fixed', questions: [{ questionId: q.body.id }] }] },
    });
    await call(ctx, 'PUT', `/admin/assessments/${test.body.id}/publishing`, {
      token: s.admin,
      body: { status: 'published' },
    });
    const asha = await s.student();
    expect(
      (await call(ctx, 'POST', `/assessments/${test.body.id}/attempts`, { token: asha.token })).status,
    ).toBe(403);
    await s.buyPlan(asha.token, id);
    expect(
      (await call(ctx, 'POST', `/assessments/${test.body.id}/attempts`, { token: asha.token })).status,
    ).toBe(200);
  });
});
