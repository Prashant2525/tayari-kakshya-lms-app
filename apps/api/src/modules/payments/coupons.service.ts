import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode, type AdminCouponQuery, type CouponInput, type LocalizedText } from '@tk/contracts';
import { discountAmount } from '@tk/domain';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { ENV, type Env } from '../../config/env.js';
import { Prisma, type Coupon } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { ContentActor } from '../content/scope.service.js';

export type CouponProblem =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'ended'
  | 'used_up'
  | 'already_used'
  | 'not_applicable'
  | 'below_minimum'
  | 'on_sale';

const MESSAGES: Record<CouponProblem, string> = {
  not_found: 'This coupon code does not exist',
  inactive: 'This coupon is no longer available',
  not_started: 'This coupon cannot be used yet',
  ended: 'This coupon has ended',
  used_up: 'This coupon has been used up',
  already_used: 'You have already used this coupon',
  not_applicable: 'This coupon does not apply to this purchase',
  below_minimum: 'The price is below this coupon’s minimum',
  on_sale: 'This coupon cannot be used on a sale price',
};

export const couponNotValid = (reason: CouponProblem) =>
  new AppError(422, ErrorCode.COUPON_NOT_VALID, MESSAGES[reason], { reason });

/** What is being bought, as checkout prices it. */
export interface PricedItem {
  kind: 'course' | 'plan';
  id: string;
  /** The price charged before any coupon (the sale price during a sale). */
  pricePaisa: number;
  onSale: boolean;
}

/**
 * The orders that use up a coupon: paid ones, and unpaid ones while they can still be paid (so two students cannot
 * both take the last use). `exclude` is the student's own unpaid order that the new one replaces.
 */
const usesWhere = (couponId: string, now: Date, exclude: string | null): Prisma.OrderWhereInput => ({
  couponId,
  OR: [{ status: 'paid' }, { status: 'pending', expiresAt: { gt: now } }],
  ...(exclude ? { id: { not: exclude } } : {}),
});

/**
 * Coupon codes (D-025, D-054, D-056): staff create and change them in the CMS (`coupons:manage`); the server alone
 * decides whether one applies and how much it takes off. Coupons are never deleted — staff switch them off — because
 * orders point at them.
 */
@Injectable()
export class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Pick<Env, 'PUBLIC_WEB_URL'>,
  ) {}

  /**
   * Checks a code for this student and purchase and returns the coupon and its discount, or throws
   * `COUPON_NOT_VALID` with the reason. Inside an order transaction, call `lock` first so limits hold under races.
   */
  async evaluate(
    db: Tx | PrismaService,
    code: string,
    userId: string,
    item: PricedItem,
    now: Date,
    options: { lock?: boolean; excludeOrderId?: string | null } = {},
  ): Promise<{ coupon: Coupon; discountPaisa: number }> {
    const found = await db.coupon.findUnique({ where: { code: code.toUpperCase() } });
    // A referral reward belongs to one student (D-058): for anyone else it does not exist.
    if (!found || (found.ownerUserId !== null && found.ownerUserId !== userId))
      throw couponNotValid('not_found');
    if (options.lock) {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`coupon:${found.id}`}))`;
    }
    const coupon = options.lock ? await db.coupon.findUniqueOrThrow({ where: { id: found.id } }) : found;
    if (!coupon.active) throw couponNotValid('inactive');
    if (coupon.startsAt && coupon.startsAt > now) throw couponNotValid('not_started');
    if (coupon.endsAt && coupon.endsAt <= now) throw couponNotValid('ended');
    if (!(await this.appliesTo(db, coupon, item))) throw couponNotValid('not_applicable');
    if (item.onSale && !coupon.allowOnSale) throw couponNotValid('on_sale');
    if (coupon.minOrderPaisa !== null && item.pricePaisa < coupon.minOrderPaisa) {
      throw couponNotValid('below_minimum');
    }
    const exclude = options.excludeOrderId ?? null;
    if (coupon.maxRedemptions !== null) {
      const used = await db.order.count({ where: usesWhere(coupon.id, now, exclude) });
      if (used >= coupon.maxRedemptions) throw couponNotValid('used_up');
    }
    if (coupon.perUserLimit !== null) {
      const mine = await db.order.count({ where: { ...usesWhere(coupon.id, now, exclude), userId } });
      if (mine >= coupon.perUserLimit) throw couponNotValid('already_used');
    }
    const discountPaisa = discountAmount(
      item.pricePaisa,
      coupon.discountType === 'percent'
        ? { type: 'percent', valueBps: coupon.percentBps!, maxDiscountPaisa: coupon.maxDiscountPaisa }
        : { type: 'fixed', valuePaisa: coupon.amountPaisa! },
    );
    return { coupon, discountPaisa };
  }

  private async appliesTo(db: Tx | PrismaService, coupon: Coupon, item: PricedItem) {
    switch (coupon.appliesTo) {
      case 'everything':
        return true;
      case 'all_courses':
        return item.kind === 'course';
      case 'all_plans':
        return item.kind === 'plan';
      case 'selected':
        return (
          (await db.couponTarget.count({
            where: {
              couponId: coupon.id,
              ...(item.kind === 'course' ? { courseId: item.id } : { planId: item.id }),
            },
          })) > 0
        );
    }
  }

  // ───────────── CMS ─────────────

  async list(query: AdminCouponQuery, now = new Date()) {
    const rows = await this.prisma.coupon.findMany({
      where: {
        ...(query.q
          ? {
              OR: [
                { code: { contains: query.q.toUpperCase() } },
                { note: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(query.state ? { active: query.state === 'active' } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, query.limit);
    const used = await this.prisma.order.groupBy({
      by: ['couponId'],
      where: { couponId: { in: page.map((c) => c.id) }, status: 'paid' },
      _count: { _all: true },
    });
    const count = new Map(used.map((u) => [u.couponId, u._count._all]));
    return {
      data: page.map((c) => ({ ...this.summary(c, now), usedCount: count.get(c.id) ?? 0 })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async detail(id: string, now = new Date()) {
    const c = await this.prisma.coupon.findUnique({ where: { id }, include: { targets: true } });
    if (!c) throw Errors.notFound('Coupon');
    const [usedCount, reserved, orders] = await Promise.all([
      this.prisma.order.count({ where: { couponId: id, status: 'paid' } }),
      this.prisma.order.count({ where: { couponId: id, status: 'pending', expiresAt: { gt: now } } }),
      this.prisma.order.findMany({
        where: { couponId: id, status: 'paid' },
        orderBy: { paidAt: 'desc' },
        take: 20,
        include: { user: { select: { fullName: true } }, items: { select: { titleSnapshot: true } } },
      }),
    ]);
    return {
      ...this.summary(c, now),
      courseIds: c.targets.flatMap((t) => (t.courseId ? [t.courseId] : [])),
      planIds: c.targets.flatMap((t) => (t.planId ? [t.planId] : [])),
      /** Share links open checkout here with the code filled in; null until PUBLIC_WEB_URL is set. */
      shareBaseUrl: this.env.PUBLIC_WEB_URL?.replace(/\/+$/, '') ?? null,
      usedCount,
      reservedCount: reserved,
      recentOrders: orders.map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        student: o.user.fullName,
        items: o.items.map((i) => i.titleSnapshot as LocalizedText),
        discountPaisa: o.discountPaisa,
        totalPaisa: o.totalPaisa,
        paidAt: o.paidAt?.toISOString() ?? null,
      })),
    };
  }

  async create(input: CouponInput, actor: ContentActor) {
    await this.checkTargets(input);
    const coupon = await this.uniqueCode(() =>
      this.prisma.$transaction(async (tx) => {
        const row = await tx.coupon.create({ data: this.data(input) });
        await this.setTargets(tx, row.id, input);
        await this.log(tx, actor, 'coupon.create', row.id, { after: input });
        return row;
      }),
    );
    return { id: coupon.id };
  }

  /** Changes apply to new orders; orders already made keep the discount they were given. */
  async update(id: string, input: CouponInput, actor: ContentActor) {
    const before = await this.prisma.coupon.findUnique({ where: { id }, include: { targets: true } });
    if (!before) throw Errors.notFound('Coupon');
    await this.checkTargets(input);
    await this.uniqueCode(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.coupon.update({ where: { id }, data: this.data(input) });
        await tx.couponTarget.deleteMany({ where: { couponId: id } });
        await this.setTargets(tx, id, input);
        const { targets, createdAt: _c, updatedAt: _u, ...rest } = before;
        await this.log(tx, actor, 'coupon.update', id, {
          before: {
            ...rest,
            startsAt: rest.startsAt?.toISOString() ?? null,
            endsAt: rest.endsAt?.toISOString() ?? null,
            courseIds: targets.flatMap((t) => (t.courseId ? [t.courseId] : [])),
            planIds: targets.flatMap((t) => (t.planId ? [t.planId] : [])),
          },
          after: input,
        });
      }),
    );
  }

  // ───────────── helpers ─────────────

  private summary(c: Coupon, now: Date) {
    const state = !c.active
      ? 'inactive'
      : c.startsAt && c.startsAt > now
        ? 'scheduled'
        : c.endsAt && c.endsAt <= now
          ? 'ended'
          : 'active';
    return {
      id: c.id,
      code: c.code,
      note: c.note,
      discountType: c.discountType,
      percentBps: c.percentBps,
      amountPaisa: c.amountPaisa,
      maxDiscountPaisa: c.maxDiscountPaisa,
      minOrderPaisa: c.minOrderPaisa,
      startsAt: c.startsAt?.toISOString() ?? null,
      endsAt: c.endsAt?.toISOString() ?? null,
      maxRedemptions: c.maxRedemptions,
      perUserLimit: c.perUserLimit,
      appliesTo: c.appliesTo,
      allowOnSale: c.allowOnSale,
      active: c.active,
      state,
      createdAt: c.createdAt.toISOString(),
    };
  }

  private data(input: CouponInput) {
    return {
      code: input.code,
      note: input.note || null,
      discountType: input.discountType,
      percentBps: input.discountType === 'percent' ? input.percentBps : null,
      amountPaisa: input.discountType === 'fixed' ? input.amountPaisa : null,
      maxDiscountPaisa: input.discountType === 'percent' ? input.maxDiscountPaisa : null,
      minOrderPaisa: input.minOrderPaisa,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      maxRedemptions: input.maxRedemptions,
      perUserLimit: input.perUserLimit,
      appliesTo: input.appliesTo,
      allowOnSale: input.allowOnSale,
      active: input.active,
    };
  }

  private async checkTargets(input: CouponInput) {
    if (input.appliesTo !== 'selected') return;
    const courses = [...new Set(input.courseIds)];
    const plans = [...new Set(input.planIds)];
    const [c, p] = await Promise.all([
      this.prisma.course.count({ where: { id: { in: courses }, deletedAt: null } }),
      this.prisma.plan.count({ where: { id: { in: plans }, deletedAt: null } }),
    ]);
    if (c !== courses.length) throw Errors.validation([{ path: 'courseIds', message: 'Unknown course' }]);
    if (p !== plans.length) throw Errors.validation([{ path: 'planIds', message: 'Unknown plan' }]);
  }

  private async setTargets(tx: Tx, couponId: string, input: CouponInput) {
    if (input.appliesTo !== 'selected') return;
    await tx.couponTarget.createMany({
      data: [
        ...[...new Set(input.courseIds)].map((courseId) => ({ couponId, courseId })),
        ...[...new Set(input.planIds)].map((planId) => ({ couponId, planId })),
      ],
    });
  }

  private async uniqueCode<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(409, ErrorCode.CONFLICT, 'Another coupon already uses this code');
      }
      throw err;
    }
  }

  private log(tx: Tx, actor: ContentActor, action: string, entityId: string, changes: unknown) {
    return this.audit.record(
      {
        actorUserId: actor.userId,
        action,
        entityType: 'coupon',
        entityId,
        changes: changes as Prisma.InputJsonValue,
        client: actor.client,
      },
      tx,
    );
  }
}
