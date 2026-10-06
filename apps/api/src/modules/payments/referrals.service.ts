import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode, type LocalizedText, type SettingValue } from '@tk/contracts';
import type { Discount } from '@tk/domain';
import { AppError } from '../../common/errors/app-error.js';
import { ENV, type Env } from '../../config/env.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';

/** Letters and digits that cannot be confused when read aloud or typed (no O/0, I/1). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = (length: number) => Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const DAY_MS = 86_400_000;

type Rules = SettingValue<'referrals.rules'>;

/** A discount from the CMS settings, or null when it is not set up. */
function discountOf(d: Rules['friendDiscount'] | Rules['reward']): Discount | null {
  if (d.type === 'percent') {
    return d.percentBps
      ? { type: 'percent', valueBps: d.percentBps, maxDiscountPaisa: d.maxDiscountPaisa }
      : null;
  }
  return d.amountPaisa ? { type: 'fixed', valuePaisa: d.amountPaisa } : null;
}

/**
 * The referral programme (D-058, D-059): every student has a personal code; a friend gives it when creating their
 * account (never later); their first purchase gets the friend discount — or a coupon, whichever is bigger, never both;
 * when that purchase is paid the referrer gets a one-time reward coupon only they can use. A full refund of that
 * purchase switches off the reward if it is still unused. Everything is in the CMS settings (`referrals.rules`).
 */
@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Pick<Env, 'PUBLIC_WEB_URL'>,
  ) {}

  /** The student's code, made the first time it is asked for. */
  async codeFor(userId: string): Promise<string> {
    const existing = await this.prisma.referralCode.findUnique({ where: { userId } });
    if (existing) return existing.code;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return (await this.prisma.referralCode.create({ data: { userId, code: code(8) } })).code;
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
        // Someone else got this code (or this student, concurrently): try again / read theirs.
        const mine = await this.prisma.referralCode.findUnique({ where: { userId } });
        if (mine) return mine.code;
      }
    }
    throw new Error('Could not make a referral code');
  }

  /**
   * Checks a referral code given at sign-up, before the account is made. Returns the referrer, or null when the
   * programme is off (the code is then ignored); an unknown code is refused so the student can correct it.
   */
  async resolveForSignup(input: string | undefined): Promise<string | null> {
    if (!input) return null;
    if (!(await this.settings.get('referrals.rules')).enabled) return null;
    const owner = await this.prisma.referralCode.findUnique({
      where: { code: input.toUpperCase() },
      include: { user: { select: { status: true } } },
    });
    if (!owner || owner.user.status !== 'active') {
      throw new AppError(422, ErrorCode.REFERRAL_CODE_NOT_VALID, 'This referral code does not exist', {
        field: 'referralCode',
      });
    }
    return owner.userId;
  }

  /** Records who referred the new student (once; never for themselves). */
  async attach(referrerId: string, refereeId: string, referralCode: string) {
    if (referrerId === refereeId) return;
    await this.prisma.referral
      .create({ data: { referrerId, refereeId, code: referralCode.toUpperCase() } })
      .catch((err: unknown) => {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      });
    await this.audit.record({
      actorUserId: refereeId,
      action: 'referral.join',
      entityType: 'referral',
      entityId: refereeId,
      changes: { referrerId, code: referralCode.toUpperCase() },
    });
  }

  /** The friend discount this student may have on a purchase now (their first, programme on, set up). */
  async friendOffer(
    db: Tx | PrismaService,
    userId: string,
    onSale: boolean,
  ): Promise<{ referralId: string; discount: Discount } | null> {
    const rules = await this.settings.get('referrals.rules');
    if (!rules.enabled) return null;
    const discount = discountOf(rules.friendDiscount);
    if (!discount || (onSale && !rules.friendDiscount.allowOnSale)) return null;
    const referral = await db.referral.findUnique({ where: { refereeId: userId } });
    if (!referral || referral.status !== 'joined' || referral.firstOrderId) return null;
    return { referralId: referral.id, discount };
  }

  /**
   * Inside the payment transaction of an order that used the friend discount: the friend's first purchase is done,
   * and the referrer gets their reward coupon (when the CMS has one set up).
   */
  async onPaid(tx: Tx, order: { id: string; referralId: string | null; orderNo: number }, now: Date) {
    if (!order.referralId) return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`referral:${order.referralId}`}))`;
    const referral = await tx.referral.findUniqueOrThrow({ where: { id: order.referralId } });
    if (referral.status !== 'joined') return;
    const rules = await this.settings.get('referrals.rules');
    const reward = discountOf(rules.reward);
    let rewardCouponId: string | null = null;
    if (reward && rules.reward.validDays) {
      const coupon = await this.rewardCoupon(tx, referral.referrerId, reward, rules.reward, now);
      rewardCouponId = coupon.id;
    }
    await tx.referral.update({
      where: { id: referral.id },
      data: { status: 'rewarded', firstOrderId: order.id, rewardCouponId, rewardedAt: now },
    });
    await this.audit.record(
      {
        actorUserId: null,
        action: 'referral.reward',
        entityType: 'referral',
        entityId: referral.id,
        changes: { orderId: order.id, orderNo: order.orderNo, rewardCouponId },
      },
      tx,
    );
  }

  /** Inside the refund approval that refunded an order in full: an unused reward from it is switched off (D-058). */
  async onFullRefund(tx: Tx, orderId: string, now: Date) {
    const referral = await tx.referral.findUnique({ where: { firstOrderId: orderId } });
    if (!referral || referral.status !== 'rewarded') return;
    if (referral.rewardCouponId) {
      const used = await tx.order.count({
        where: {
          couponId: referral.rewardCouponId,
          OR: [{ status: { in: ['paid', 'refunded'] } }, { status: 'pending', expiresAt: { gt: now } }],
        },
      });
      // A reward already used stays used (no clawback).
      if (used > 0) return;
      await tx.coupon.update({ where: { id: referral.rewardCouponId }, data: { active: false } });
    }
    await tx.referral.update({ where: { id: referral.id }, data: { status: 'cancelled', cancelledAt: now } });
    await this.audit.record(
      {
        actorUserId: null,
        action: 'referral.cancel',
        entityType: 'referral',
        entityId: referral.id,
        changes: { orderId, rewardCouponId: referral.rewardCouponId },
      },
      tx,
    );
  }

  /** "Invite friends": the student's code and link, what friends and they get, and their rewards. */
  async mine(userId: string, now = new Date()) {
    const rules = await this.settings.get('referrals.rules');
    const [made, rewards] = await Promise.all([
      this.prisma.referral.groupBy({ by: ['status'], where: { referrerId: userId }, _count: { _all: true } }),
      this.prisma.coupon.findMany({
        where: { ownerUserId: userId },
        orderBy: { createdAt: 'desc' },
        include: { orders: { where: { status: { in: ['paid', 'refunded'] } }, select: { id: true } } },
      }),
    ]);
    const count = (s: string) => made.find((m) => m.status === s)?._count._all ?? 0;
    const enabled = rules.enabled && Boolean(discountOf(rules.friendDiscount));
    const code = enabled ? await this.codeFor(userId) : null;
    const base = this.env.PUBLIC_WEB_URL?.replace(/\/+$/, '');
    const describe = (d: Rules['friendDiscount'] | Rules['reward']) => ({
      type: d.type,
      percentBps: d.type === 'percent' ? d.percentBps : null,
      amountPaisa: d.type === 'fixed' ? d.amountPaisa : null,
      maxDiscountPaisa: d.type === 'percent' ? d.maxDiscountPaisa : null,
    });
    return {
      enabled,
      code,
      link: code && base ? `${base}/r/${code}` : null,
      friendDiscount: enabled ? describe(rules.friendDiscount) : null,
      reward:
        enabled && discountOf(rules.reward)
          ? { ...describe(rules.reward), validDays: rules.reward.validDays }
          : null,
      joined: count('joined') + count('rewarded') + count('cancelled'),
      rewarded: count('rewarded'),
      rewards: rewards.map((c) => ({
        code: c.code,
        type: c.discountType,
        percentBps: c.percentBps,
        amountPaisa: c.amountPaisa,
        maxDiscountPaisa: c.maxDiscountPaisa,
        endsAt: c.endsAt?.toISOString() ?? null,
        state: c.orders.length
          ? ('used' as const)
          : !c.active
            ? ('cancelled' as const)
            : c.endsAt && c.endsAt <= now
              ? ('expired' as const)
              : ('available' as const),
      })),
    };
  }

  /** Referrals for staff, newest first. */
  async list(query: {
    cursor?: string | undefined;
    limit: number;
    status?: 'joined' | 'rewarded' | 'cancelled' | undefined;
  }) {
    const rows = await this.prisma.referral.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        referrer: { select: { id: true, fullName: true } },
        referee: { select: { id: true, fullName: true } },
        rewardCoupon: { select: { id: true, code: true, active: true } },
        orders: {
          where: { status: { in: ['paid', 'refunded'] } },
          select: {
            id: true,
            orderNo: true,
            totalPaisa: true,
            discountPaisa: true,
            items: { select: { titleSnapshot: true } },
          },
        },
      },
    });
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((r) => ({
        id: r.id,
        status: r.status,
        code: r.code,
        createdAt: r.createdAt.toISOString(),
        rewardedAt: r.rewardedAt?.toISOString() ?? null,
        referrer: r.referrer,
        referee: r.referee,
        firstOrder: r.orders[0]
          ? {
              id: r.orders[0].id,
              orderNo: r.orders[0].orderNo,
              totalPaisa: r.orders[0].totalPaisa,
              discountPaisa: r.orders[0].discountPaisa,
              items: r.orders[0].items.map((i) => i.titleSnapshot as LocalizedText),
            }
          : null,
        rewardCoupon: r.rewardCoupon,
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  /**
   * The referrer's one-time coupon. Inside a transaction an error would abort it, so an unused code is found first
   * (codes are random among 32^8; a clash is practically impossible).
   */
  private async rewardCoupon(
    tx: Tx,
    ownerUserId: string,
    reward: Discount,
    rules: Rules['reward'],
    now: Date,
  ) {
    let candidate = `REF-${code(8)}`;
    while (await tx.coupon.findUnique({ where: { code: candidate }, select: { id: true } })) {
      candidate = `REF-${code(8)}`;
    }
    return tx.coupon.create({
      data: {
        code: candidate,
        note: 'Referral reward',
        discountType: reward.type,
        percentBps: reward.type === 'percent' ? reward.valueBps : null,
        amountPaisa: reward.type === 'fixed' ? reward.valuePaisa : null,
        maxDiscountPaisa: reward.type === 'percent' ? (reward.maxDiscountPaisa ?? null) : null,
        startsAt: now,
        endsAt: new Date(now.getTime() + rules.validDays! * DAY_MS),
        maxRedemptions: 1,
        perUserLimit: 1,
        appliesTo: 'everything',
        allowOnSale: rules.allowOnSale,
        active: true,
        ownerUserId,
      },
    });
  }
}
