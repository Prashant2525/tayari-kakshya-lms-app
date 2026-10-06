import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type AdminRefundQuery,
  type LocalizedText,
  type RefundCompleteInput,
  type RefundDecisionInput,
  type RefundRequestInput,
} from '@tk/contracts';
import { AppError, Errors } from '../../common/errors/app-error.js';
import type { Prisma, Refund } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { ContentActor } from '../content/scope.service.js';

const refused = (reason: string, message: string) =>
  new AppError(409, ErrorCode.CONFLICT, message, { reason });

/** Refunds that still count against what was paid (all but rejected ones). */
const COUNTED: Refund['status'][] = ['requested', 'approved', 'refunded'];

/**
 * Refunds (D-026, D-057): staff with `refunds:request` ask, with the reason; someone with `refunds:approve` approves or
 * rejects, and records the refund as sent with its reference once the money has gone back (eSewa / Khalti merchant
 * portal, or bank). The refunds of an order never add up to more than it was paid. When the approved refunds reach the
 * whole amount, the order is marked refunded and the access it gave is removed; a partial refund keeps access.
 * Everything is audited and nothing is deleted.
 */
@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async request(orderId: string, input: RefundRequestInput, actor: ContentActor) {
    const refund = await this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (order.status !== 'paid') throw refused('not_paid', 'Only a paid order can be refunded');
      if (order.totalPaisa === 0) throw refused('nothing_paid', 'Nothing was paid for this order');
      const counted = await this.sum(tx, orderId, COUNTED);
      if (counted + input.amountPaisa > order.totalPaisa) {
        throw refused(
          'exceeds_paid',
          `At most ${order.totalPaisa - counted} paisa can still be refunded on this order`,
        );
      }
      const row = await tx.refund.create({
        data: { orderId, amountPaisa: input.amountPaisa, reason: input.reason, requestedById: actor.userId },
      });
      await this.log(tx, actor, 'refund.request', row.id, {
        orderId,
        orderNo: order.orderNo,
        amountPaisa: input.amountPaisa,
        reason: input.reason,
      });
      return row;
    });
    return this.view(refund.id);
  }

  async approve(id: string, input: RefundDecisionInput, actor: ContentActor, now = new Date()) {
    await this.prisma.$transaction(async (tx) => {
      const refund = await this.lockRefund(tx, id);
      if (refund.status !== 'requested') throw refused('already_decided', 'This refund was already decided');
      const order = await tx.order.findUniqueOrThrow({ where: { id: refund.orderId } });
      const approved = await this.sum(tx, order.id, ['approved', 'refunded']);
      const full = approved + refund.amountPaisa >= order.totalPaisa;
      await tx.refund.update({
        where: { id },
        data: {
          status: 'approved',
          full,
          decidedById: actor.userId,
          decidedAt: now,
          decisionNote: input.note,
        },
      });
      let revoked = 0;
      if (full) {
        // The whole amount goes back: the order is refunded and the access it gave ends now.
        await tx.order.update({ where: { id: order.id }, data: { status: 'refunded' } });
        revoked = (
          await tx.entitlement.updateMany({
            where: { sourceType: 'order', sourceId: order.id, status: 'active' },
            data: { status: 'revoked', revokedAt: now, revokedReason: 'refund' },
          })
        ).count;
      }
      await this.log(tx, actor, 'refund.approve', id, {
        orderId: order.id,
        orderNo: order.orderNo,
        amountPaisa: refund.amountPaisa,
        full,
        accessRemoved: revoked,
        note: input.note,
      });
    });
    return this.view(id);
  }

  async reject(id: string, input: RefundDecisionInput, actor: ContentActor, now = new Date()) {
    await this.prisma.$transaction(async (tx) => {
      const refund = await this.lockRefund(tx, id);
      if (refund.status !== 'requested') throw refused('already_decided', 'This refund was already decided');
      await tx.refund.update({
        where: { id },
        data: { status: 'rejected', decidedById: actor.userId, decidedAt: now, decisionNote: input.note },
      });
      await this.log(tx, actor, 'refund.reject', id, { orderId: refund.orderId, note: input.note });
    });
    return this.view(id);
  }

  /** The money was sent back: its reference at the gateway or bank. */
  async complete(id: string, input: RefundCompleteInput, actor: ContentActor, now = new Date()) {
    await this.prisma.$transaction(async (tx) => {
      const refund = await this.lockRefund(tx, id);
      if (refund.status !== 'approved')
        throw refused('not_approved', 'Only an approved refund can be marked sent');
      await tx.refund.update({
        where: { id },
        data: {
          status: 'refunded',
          refundedById: actor.userId,
          refundedAt: now,
          providerReference: input.reference,
          refundNote: input.note,
        },
      });
      await this.log(tx, actor, 'refund.complete', id, {
        orderId: refund.orderId,
        amountPaisa: refund.amountPaisa,
        reference: input.reference,
        note: input.note,
      });
    });
    return this.view(id);
  }

  async list(query: AdminRefundQuery) {
    const rows = await this.prisma.refund.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: INCLUDE,
    });
    const page = rows.slice(0, query.limit);
    return {
      data: page.map(present),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async forOrder(orderId: string) {
    const rows = await this.prisma.refund.findMany({
      where: { orderId },
      orderBy: { requestedAt: 'asc' },
      include: INCLUDE,
    });
    return rows.map(present);
  }

  private async view(id: string) {
    return present(await this.prisma.refund.findUniqueOrThrow({ where: { id }, include: INCLUDE }));
  }

  // ───────────── helpers ─────────────

  private async lockOrder(tx: Tx, orderId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`refund:${orderId}`}))`;
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw Errors.notFound('Order');
    return order;
  }

  private async lockRefund(tx: Tx, id: string) {
    const first = await tx.refund.findUnique({ where: { id } });
    if (!first) throw Errors.notFound('Refund');
    await this.lockOrder(tx, first.orderId);
    return tx.refund.findUniqueOrThrow({ where: { id } });
  }

  private async sum(tx: Tx, orderId: string, statuses: Refund['status'][]) {
    const agg = await tx.refund.aggregate({
      where: { orderId, status: { in: statuses } },
      _sum: { amountPaisa: true },
    });
    return agg._sum.amountPaisa ?? 0;
  }

  private log(tx: Tx, actor: ContentActor, action: string, entityId: string, changes: Prisma.InputJsonValue) {
    return this.audit.record(
      { actorUserId: actor.userId, action, entityType: 'refund', entityId, changes, client: actor.client },
      tx,
    );
  }
}

const person = { select: { id: true, fullName: true } } as const;
const INCLUDE = {
  order: {
    select: {
      id: true,
      orderNo: true,
      totalPaisa: true,
      status: true,
      user: { select: { id: true, fullName: true } },
      items: { select: { titleSnapshot: true } },
    },
  },
  requestedBy: person,
  decidedBy: person,
  refundedBy: person,
} as const;

type RefundWithPeople = Prisma.RefundGetPayload<{ include: typeof INCLUDE }>;

function present(r: RefundWithPeople) {
  return {
    id: r.id,
    status: r.status,
    amountPaisa: r.amountPaisa,
    full: r.full,
    reason: r.reason,
    order: {
      id: r.order.id,
      orderNo: r.order.orderNo,
      totalPaisa: r.order.totalPaisa,
      status: r.order.status,
      student: r.order.user,
      items: r.order.items.map((i) => i.titleSnapshot as LocalizedText),
    },
    requestedBy: r.requestedBy,
    requestedAt: r.requestedAt.toISOString(),
    decidedBy: r.decidedBy,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    decisionNote: r.decisionNote,
    refundedBy: r.refundedBy,
    refundedAt: r.refundedAt?.toISOString() ?? null,
    providerReference: r.providerReference,
    refundNote: r.refundNote,
  };
}
