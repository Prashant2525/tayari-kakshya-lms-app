import { Injectable } from '@nestjs/common';
import type { AnalyticsRange, ExportKind, LocalizedText } from '@tk/contracts';
import { formatBs, instantToBs } from '@tk/domain';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { ContentActor } from '../content/scope.service.js';
import { AnalyticsService } from './analytics.service.js';
import { csv, rupees, type Cell } from './csv.js';

/** One file stays small enough to open in a spreadsheet; a longer period is exported in parts. */
export const MAX_EXPORT_ROWS = 50_000;

const en = (text: unknown) => {
  const t = text as LocalizedText | null | undefined;
  return t?.en ?? t?.ne ?? '';
};
const bs = (d: Date | null | undefined) => (d ? formatBs(instantToBs(d), 'en', 'short') : '');
const ad = (d: Date | null | undefined) => (d ? d.toISOString() : '');

/**
 * CSV downloads for the CMS (Phase 13e, D-066, T-068): orders, students, enrolments and test results over a period of
 * Nepal days, dates in BS and AD, money in rupees. Every download is audited (who, what, which period, how many rows).
 */
@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
  ) {}

  async export(kind: ExportKind, range: AnalyticsRange, actor: ContentActor) {
    const p = this.analytics.period(range);
    const window = { gte: p.start, lt: p.end };
    let header: string[];
    let rows: Cell[][];
    if (kind === 'orders') {
      const orders = await this.prisma.order.findMany({
        where: { createdAt: window },
        include: {
          user: { select: { fullName: true, email: true, phone: true } },
          items: { select: { itemType: true, titleSnapshot: true } },
          payments: {
            where: { status: 'completed', duplicate: false },
            select: { provider: true, providerTransactionId: true },
          },
          refunds: { where: { status: 'refunded' }, select: { amountPaisa: true } },
        },
        orderBy: { orderNo: 'asc' },
        take: MAX_EXPORT_ROWS + 1,
      });
      header = [
        'Order no',
        'Created (BS)',
        'Created (AD)',
        'Paid (BS)',
        'Paid (AD)',
        'Status',
        'Channel',
        'Student',
        'Email',
        'Phone',
        'Item type',
        'Item',
        'Subtotal (Rs)',
        'Discount (Rs)',
        'Tax (Rs)',
        'Total (Rs)',
        'Coupon',
        'Payment provider',
        'Provider transaction',
        'Refunded (Rs)',
      ];
      rows = orders
        .slice(0, MAX_EXPORT_ROWS)
        .map((o) => [
          o.orderNo,
          bs(o.createdAt),
          ad(o.createdAt),
          bs(o.paidAt),
          ad(o.paidAt),
          o.status,
          o.channel,
          o.user.fullName,
          o.user.email,
          o.user.phone,
          o.items.map((i) => i.itemType).join('; '),
          o.items.map((i) => en(i.titleSnapshot)).join('; '),
          rupees(o.subtotalPaisa),
          rupees(o.discountPaisa),
          rupees(o.taxPaisa),
          rupees(o.totalPaisa),
          o.couponCode,
          o.payments[0]?.provider,
          o.payments[0]?.providerTransactionId,
          rupees(o.refunds.reduce((s, r) => s + r.amountPaisa, 0)),
        ]);
      return this.finish(kind, p, header, rows, orders.length > MAX_EXPORT_ROWS, actor);
    }
    if (kind === 'students') {
      const users = await this.prisma.user.findMany({
        where: { kind: 'student', createdAt: window },
        select: {
          id: true,
          fullName: true,
          email: true,
          emailVerifiedAt: true,
          phone: true,
          phoneVerifiedAt: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
          _count: { select: { entitlements: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: MAX_EXPORT_ROWS + 1,
      });
      header = [
        'Name',
        'Email',
        'Email verified',
        'Phone',
        'Phone verified',
        'Status',
        'Signed up (BS)',
        'Signed up (AD)',
        'Last sign-in (BS)',
        'Last sign-in (AD)',
        'Courses and plans (ever)',
      ];
      rows = users
        .slice(0, MAX_EXPORT_ROWS)
        .map((u) => [
          u.fullName,
          u.email,
          Boolean(u.emailVerifiedAt),
          u.phone,
          Boolean(u.phoneVerifiedAt),
          u.status,
          bs(u.createdAt),
          ad(u.createdAt),
          bs(u.lastLoginAt),
          ad(u.lastLoginAt),
          u._count.entitlements,
        ]);
      return this.finish(kind, p, header, rows, users.length > MAX_EXPORT_ROWS, actor);
    }
    if (kind === 'enrolments') {
      const items = await this.prisma.entitlement.findMany({
        where: { createdAt: window },
        include: {
          user: { select: { fullName: true, email: true } },
          course: { select: { title: true } },
          plan: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: MAX_EXPORT_ROWS + 1,
      });
      header = [
        'Student',
        'Email',
        'Type',
        'Course or plan',
        'How',
        'Starts (BS)',
        'Starts (AD)',
        'Ends (BS)',
        'Ends (AD)',
        'Status',
        'Revoked reason',
      ];
      rows = items
        .slice(0, MAX_EXPORT_ROWS)
        .map((e) => [
          e.user.fullName,
          e.user.email,
          e.scopeType,
          e.course ? en(e.course.title) : en(e.plan?.name),
          e.sourceType,
          bs(e.startsAt),
          ad(e.startsAt),
          bs(e.endsAt),
          ad(e.endsAt),
          e.status,
          e.revokedReason,
        ]);
      return this.finish(kind, p, header, rows, items.length > MAX_EXPORT_ROWS, actor);
    }
    const attempts = await this.prisma.attempt.findMany({
      where: { submittedAt: window, status: { in: ['completed', 'pending_grading'] } },
      include: {
        user: { select: { fullName: true, email: true } },
        assessment: { select: { title: true, type: true } },
      },
      orderBy: { submittedAt: 'asc' },
      take: MAX_EXPORT_ROWS + 1,
    });
    header = [
      'Test',
      'Type',
      'Student',
      'Email',
      'Attempt',
      'Practice',
      'Status',
      'Submitted (BS)',
      'Submitted (AD)',
      'Score',
      'Out of',
      'Percent',
      'Passed',
      'Time taken (min)',
      'Correct',
      'Partly correct',
      'Wrong',
      'Skipped',
    ];
    rows = attempts
      .slice(0, MAX_EXPORT_ROWS)
      .map((a) => [
        en(a.assessment.title),
        a.assessment.type,
        a.user.fullName,
        a.user.email,
        a.attemptNo,
        a.practice,
        a.status,
        bs(a.submittedAt),
        ad(a.submittedAt),
        a.score === null ? '' : a.score / 100,
        a.maxScore / 100,
        a.score === null || a.maxScore === 0 ? '' : Math.round((Math.max(0, a.score) * 100) / a.maxScore),
        a.passed,
        a.timeTakenSeconds === null ? '' : Math.round(a.timeTakenSeconds / 60),
        a.correctCount,
        a.partialCount,
        a.wrongCount,
        a.skippedCount,
      ]);
    return this.finish(kind, p, header, rows, attempts.length > MAX_EXPORT_ROWS, actor);
  }

  private async finish(
    kind: ExportKind,
    p: { from: string; to: string },
    header: string[],
    rows: Cell[][],
    truncated: boolean,
    actor: ContentActor,
  ) {
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'export.download',
      entityType: 'export',
      entityId: null,
      changes: { kind, from: p.from, to: p.to, rows: rows.length, truncated },
      client: actor.client,
    });
    return {
      filename: `${kind}-${p.from}-to-${p.to}.csv`,
      body: csv(header, rows),
      rows: rows.length,
      truncated,
    };
  }
}
