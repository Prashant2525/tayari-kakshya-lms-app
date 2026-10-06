import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type LocalizedText,
  type Platform,
  type PlanCoursesInput,
  type PlanInput,
  type PlanPricingInput,
  type PlanStatusInput,
} from '@tk/contracts';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { Prisma, type Plan } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { activeEntitlementWhere } from '../content/entitlements.service.js';
import { assertSchedule, isLive, liveWhere } from '../content/publishing.js';
import type { ContentActor } from '../content/scope.service.js';
import { SettingsService } from '../settings/settings.service.js';

const json = (v: unknown) => (v ?? Prisma.DbNull) as Prisma.InputJsonValue;

export function saleActive(
  p: { salePricePaisa: number | null; saleStartsAt: Date | null; saleEndsAt: Date | null },
  now = new Date(),
) {
  return (
    p.salePricePaisa !== null &&
    (!p.saleStartsAt || p.saleStartsAt <= now) &&
    (!p.saleEndsAt || p.saleEndsAt > now)
  );
}

/** What a plan costs right now (sale included). */
export const planPrice = (p: Plan, now = new Date()) =>
  saleActive(p, now) ? (p.salePricePaisa as number) : p.pricePaisa;

/**
 * Subscription plans (D-023, D-054): staff write them in the CMS (permission `plans:manage`); students see the live
 * ones with their own status. Bought like courses (PaymentsService). Prices only where the platform sells (D-027).
 */
@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
  ) {}

  // ───────────── Students ─────────────

  async live(platform: Platform, userId: string | null, now = new Date()) {
    const plans = await this.prisma.plan.findMany({
      where: liveWhere(now),
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        courses: {
          where: { course: liveWhere(now) },
          orderBy: { sortOrder: 'asc' },
          include: { course: { select: { id: true, slug: true, title: true } } },
        },
      },
    });
    const mine = userId
      ? await this.prisma.entitlement.findMany({
          where: { userId, scopeType: 'plan', ...activeEntitlementWhere(now) },
          select: { planId: true, endsAt: true },
        })
      : [];
    const purchasable = await this.purchasable(platform);
    return plans.map((p) => {
      const active = mine.filter((m) => m.planId === p.id);
      const endsAt = active.some((a) => a.endsAt === null)
        ? null
        : (active.map((a) => a.endsAt!).sort((a, b) => b.getTime() - a.getTime())[0] ?? null);
      return {
        id: p.id,
        slug: p.slug,
        name: p.name as LocalizedText,
        description: (p.description as LocalizedText | null) ?? null,
        features: p.features as LocalizedText[],
        coverage: p.coverage,
        isFeatured: p.isFeatured,
        isFree: p.pricePaisa === 0,
        validity: {
          type: p.validityType,
          days: p.validityDays,
          endsOn: p.validityEndsOn?.toISOString().slice(0, 10) ?? null,
        },
        courses: p.courses.map((c) => ({
          id: c.course.id,
          slug: c.course.slug,
          title: c.course.title as LocalizedText,
        })),
        pricing:
          purchasable && p.pricePaisa > 0
            ? {
                pricePaisa: p.pricePaisa,
                salePricePaisa: saleActive(p, now) ? p.salePricePaisa : null,
                saleEndsAt: saleActive(p, now) ? (p.saleEndsAt?.toISOString() ?? null) : null,
                effectivePricePaisa: planPrice(p, now),
              }
            : null,
        mine: active.length ? { endsAt: endsAt?.toISOString() ?? null } : null,
      };
    });
  }

  // ───────────── CMS ─────────────

  async list() {
    const now = new Date();
    const rows = await this.prisma.plan.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { courses: true } } },
    });
    const subscribers = await this.prisma.entitlement.groupBy({
      by: ['planId'],
      where: { scopeType: 'plan', ...activeEntitlementWhere(now) },
      _count: { _all: true },
    });
    const count = new Map(subscribers.map((s) => [s.planId, s._count._all]));
    return rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name as LocalizedText,
      status: p.status,
      publishAt: p.publishAt?.toISOString() ?? null,
      coverage: p.coverage,
      pricePaisa: p.pricePaisa,
      effectivePricePaisa: planPrice(p, now),
      courseCount: p._count.courses,
      activeSubscribers: count.get(p.id) ?? 0,
      sortOrder: p.sortOrder,
    }));
  }

  async detail(id: string) {
    const p = await this.find(id);
    const courses = await this.prisma.planCourse.findMany({
      where: { planId: id },
      orderBy: { sortOrder: 'asc' },
      select: { courseId: true },
    });
    const activeSubscribers = await this.prisma.entitlement.count({
      where: { planId: id, scopeType: 'plan', ...activeEntitlementWhere() },
    });
    return {
      id: p.id,
      slug: p.slug,
      name: p.name as LocalizedText,
      description: (p.description as LocalizedText | null) ?? null,
      features: p.features as LocalizedText[],
      coverage: p.coverage,
      isFeatured: p.isFeatured,
      sortOrder: p.sortOrder,
      status: p.status,
      publishAt: p.publishAt?.toISOString() ?? null,
      pricing: {
        pricePaisa: p.pricePaisa,
        salePricePaisa: p.salePricePaisa,
        saleStartsAt: p.saleStartsAt?.toISOString() ?? null,
        saleEndsAt: p.saleEndsAt?.toISOString() ?? null,
        validityType: p.validityType,
        validityDays: p.validityDays,
        validityEndsOn: p.validityEndsOn?.toISOString().slice(0, 10) ?? null,
      },
      courseIds: courses.map((c) => c.courseId),
      activeSubscribers,
    };
  }

  async create(input: PlanInput, actor: ContentActor) {
    const plan = await this.uniqueSlug(() =>
      this.prisma.$transaction(async (tx) => {
        const row = await tx.plan.create({
          data: {
            ...this.data(input),
            // A new plan starts unsold; its price and validity are set on the Pricing step.
            pricePaisa: 0,
            validityType: 'days',
            validityDays: 365,
            createdById: actor.userId,
            updatedById: actor.userId,
          },
        });
        await this.log(tx, actor, 'plan.create', row.id, { after: input });
        return row;
      }),
    );
    return { id: plan.id };
  }

  async update(id: string, input: PlanInput, actor: ContentActor) {
    const before = await this.find(id);
    await this.uniqueSlug(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.plan.update({ where: { id }, data: { ...this.data(input), updatedById: actor.userId } });
        await this.log(tx, actor, 'plan.update', id, {
          before: { slug: before.slug, name: before.name, coverage: before.coverage },
          after: input,
        });
      }),
    );
  }

  /** Price and validity changes are audited with before / after; they apply to new purchases. */
  async updatePricing(id: string, input: PlanPricingInput, actor: ContentActor) {
    const before = await this.find(id);
    const data = {
      pricePaisa: input.pricePaisa,
      salePricePaisa: input.salePricePaisa,
      saleStartsAt: input.saleStartsAt ? new Date(input.saleStartsAt) : null,
      saleEndsAt: input.saleEndsAt ? new Date(input.saleEndsAt) : null,
      validityType: input.validityType,
      validityDays: input.validityType === 'days' ? input.validityDays : null,
      validityEndsOn:
        input.validityType === 'fixed_date' && input.validityEndsOn
          ? new Date(`${input.validityEndsOn}T00:00:00Z`)
          : null,
    };
    if (data.salePricePaisa !== null && data.salePricePaisa >= data.pricePaisa) {
      throw Errors.validation([
        { path: 'salePricePaisa', message: 'The sale price must be below the price' },
      ]);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.plan.update({ where: { id }, data: { ...data, updatedById: actor.userId } });
      await this.log(tx, actor, 'plan.pricing', id, {
        before: {
          pricePaisa: before.pricePaisa,
          salePricePaisa: before.salePricePaisa,
          validityType: before.validityType,
          validityDays: before.validityDays,
        },
        after: input,
      });
    });
  }

  /** The plan's courses (D-054: current subscribers get the new list at once). */
  async setCourses(id: string, input: PlanCoursesInput, actor: ContentActor) {
    await this.find(id);
    const unique = [...new Set(input.courseIds)];
    const found = await this.prisma.course.count({ where: { id: { in: unique }, deletedAt: null } });
    if (found !== unique.length) throw Errors.validation([{ path: 'courseIds', message: 'Unknown course' }]);
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.planCourse.findMany({ where: { planId: id }, select: { courseId: true } });
      await tx.planCourse.deleteMany({ where: { planId: id } });
      await tx.planCourse.createMany({
        data: unique.map((courseId, i) => ({ planId: id, courseId, sortOrder: i })),
      });
      await this.log(tx, actor, 'plan.courses', id, {
        before: before.map((b) => b.courseId),
        after: unique,
      });
    });
  }

  async setStatus(id: string, input: PlanStatusInput, actor: ContentActor) {
    const before = await this.find(id);
    const publishAt = input.publishAt ? new Date(input.publishAt) : null;
    assertSchedule(input.status, publishAt);
    if ((input.status === 'published' || input.status === 'scheduled') && before.pricePaisa > 0) {
      if (
        before.validityType === 'fixed_date' &&
        before.validityEndsOn &&
        before.validityEndsOn <= new Date()
      ) {
        throw new AppError(409, ErrorCode.CONFLICT, 'The plan has ended: change its validity first');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.plan.update({
        where: { id },
        data: { status: input.status, publishAt, updatedById: actor.userId },
      });
      await this.log(tx, actor, 'plan.status', id, {
        before: before.status,
        after: input.status,
        live: isLive({ status: input.status, publishAt }),
      });
    });
  }

  // ───────────── helpers ─────────────

  private async purchasable(platform: Platform): Promise<boolean> {
    const channels = await this.settings.get('purchase.channels');
    if (platform === 'ios') return false;
    if (platform === 'android') return channels.android === 'in_app';
    return channels.web === 'enabled';
  }

  private async find(id: string) {
    const plan = await this.prisma.plan.findFirst({ where: { id, deletedAt: null } });
    if (!plan) throw Errors.notFound('Plan');
    return plan;
  }

  private data(input: PlanInput) {
    return {
      slug: input.slug,
      name: json(input.name),
      description: json(input.description),
      features: json(input.features),
      coverage: input.coverage,
      isFeatured: input.isFeatured,
      sortOrder: input.sortOrder,
    };
  }

  private async uniqueSlug<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(409, ErrorCode.CONFLICT, 'Another plan already uses this address (slug)');
      }
      throw err;
    }
  }

  private log(
    tx: Prisma.TransactionClient,
    actor: ContentActor,
    action: string,
    entityId: string,
    changes: Prisma.InputJsonValue,
  ) {
    return this.audit.record(
      { actorUserId: actor.userId, action, entityType: 'plan', entityId, changes, client: actor.client },
      tx,
    );
  }
}
