import { Injectable } from '@nestjs/common';
import type { AdminOrderQuery, LocalizedText } from '@tk/contracts';
import { Errors } from '../../common/errors/app-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { ContentActor } from '../content/scope.service.js';
import { PaymentsService } from './payments.service.js';

/** Orders and payments in the CMS (Phase 11): what was bought, every payment attempt and what the gateways said. */
@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminOrderQuery) {
    const orderNo = query.q && /^#?\d+$/.test(query.q) ? Number(query.q.replace('#', '')) : null;
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.provider ? { payments: { some: { provider: query.provider } } } : {}),
      AND: [
        query.q
          ? {
              OR: [
                ...(orderNo !== null ? [{ orderNo }] : []),
                { user: { fullName: { contains: query.q, mode: 'insensitive' as const } } },
                { user: { email: { contains: query.q.toLowerCase() } } },
              ],
            }
          : {},
        query.attention
          ? { payments: { some: { OR: [{ duplicate: true }, { failureReason: 'amount_mismatch' }] } } }
          : {},
      ],
      ...(query.cursor ? { id: { lt: query.cursor } } : {}),
    };
    const rows = await this.prisma.order.findMany({
      where,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true } },
        items: { select: { titleSnapshot: true } },
        payments: { orderBy: { initiatedAt: 'desc' } },
      },
    });
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        status: o.status,
        channel: o.channel,
        totalPaisa: o.totalPaisa,
        createdAt: o.createdAt.toISOString(),
        paidAt: o.paidAt?.toISOString() ?? null,
        student: { id: o.user.id, fullName: o.user.fullName, contact: o.user.email ?? o.user.phone },
        items: o.items.map((i) => i.titleSnapshot as LocalizedText),
        lastPayment: o.payments[0]
          ? { provider: o.payments[0].provider, status: o.payments[0].status }
          : null,
        attention: o.payments.some((p) => p.duplicate || p.failureReason === 'amount_mismatch'),
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async detail(id: string) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true } },
        items: { include: { course: { select: { id: true, slug: true } } } },
        payments: {
          orderBy: { initiatedAt: 'asc' },
          include: { events: { orderBy: { receivedAt: 'asc' } } },
        },
      },
    });
    if (!o) throw Errors.notFound('Order');
    const entitlements = await this.prisma.entitlement.findMany({
      where: { sourceType: 'order', sourceId: o.id },
      select: { id: true, courseId: true, status: true, startsAt: true, endsAt: true, revokedReason: true },
    });
    return {
      id: o.id,
      orderNo: o.orderNo,
      status: o.status,
      channel: o.channel,
      currency: o.currency,
      subtotalPaisa: o.subtotalPaisa,
      discountPaisa: o.discountPaisa,
      couponCode: o.couponCode,
      couponId: o.couponId,
      tax:
        o.taxRateBps === null
          ? null
          : { rateBps: o.taxRateBps, inclusive: o.taxInclusive, paisa: o.taxPaisa },
      totalPaisa: o.totalPaisa,
      createdAt: o.createdAt.toISOString(),
      expiresAt: o.expiresAt.toISOString(),
      paidAt: o.paidAt?.toISOString() ?? null,
      student: { id: o.user.id, fullName: o.user.fullName, contact: o.user.email ?? o.user.phone },
      items: o.items.map((i) => ({
        courseId: i.courseId,
        title: i.titleSnapshot as LocalizedText,
        pricePaisa: i.unitPricePaisa,
        validity: i.validitySnapshot,
      })),
      access: entitlements.map((e) => ({
        id: e.id,
        courseId: e.courseId,
        status: e.status,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt?.toISOString() ?? null,
        revokedReason: e.revokedReason,
      })),
      payments: o.payments.map((p) => ({
        id: p.id,
        provider: p.provider,
        status: p.status,
        amountPaisa: p.amountPaisa,
        providerReference: p.providerReference,
        providerTransactionId: p.providerTransactionId,
        duplicate: p.duplicate,
        failureReason: p.failureReason,
        initiatedAt: p.initiatedAt.toISOString(),
        completedAt: p.completedAt?.toISOString() ?? null,
        lastCheckedAt: p.lastCheckedAt?.toISOString() ?? null,
        events: p.events.map((e) => ({
          id: e.id,
          type: e.eventType,
          result: e.result,
          at: e.receivedAt.toISOString(),
          payload: e.payload,
        })),
      })),
    };
  }

  /** Staff ask the gateway again (e.g. a student says they paid); the outcome is settled like any other check. */
  async recheck(paymentId: string, actor: ContentActor) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw Errors.notFound('Payment');
    const before = payment.status;
    const after = await this.payments.check(payment, 'staff', { by: actor.userId });
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'payment.check',
      entityType: 'payment',
      entityId: paymentId,
      changes: { before, after: after.status },
      client: actor.client,
    });
    return { status: after.status };
  }
}
