import { Injectable, Logger } from '@nestjs/common';
import {
  ErrorCode,
  type CampaignAudience,
  type CampaignInput,
  type CampaignLink,
  type CampaignQuery,
  type LocalizedText,
} from '@tk/contracts';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { Prisma, type NotificationCampaign } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { EntitlementsService } from '../content/entitlements.service.js';
import type { ContentActor } from '../content/scope.service.js';
import { NotificationsService, type NotificationLink } from './notifications.service.js';

/** A campaign left in `sending` this long (the worker stopped mid-way) is picked up again; resending is harmless. */
const STUCK_MS = 10 * 60_000;
/** A send time this close to now counts as "now". */
const NOW_SLACK_MS = 60_000;

const liveWhere = (now: Date) => ({
  deletedAt: null,
  OR: [{ status: 'published' as const }, { status: 'scheduled' as const, publishAt: { lte: now } }],
});

/**
 * Notification campaigns (D-075 / audit F-08): staff (`campaigns:send`) write a message, choose who gets it — every
 * active student, students with access to some courses, or students preparing for some exams — and send it now or
 * at a set time. It lands in each student's notifications; push and email follow the student's "Announcements"
 * choices. A campaign reaches a student once (`campaign:<id>`), so a retried send never repeats it. Sent and
 * cancelled campaigns are kept.
 */
@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: CampaignQuery) {
    const rows = await this.prisma.notificationCampaign.findMany({
      where: { deletedAt: null, ...(query.status ? { status: query.status } : {}) },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { createdBy: { select: { fullName: true } } },
    });
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((r) => this.view(r)),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async get(id: string) {
    return this.view(await this.find(id));
  }

  async create(input: CampaignInput, actor: ContentActor) {
    await this.checkTargets(input.audience, input.link);
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.notificationCampaign.create({
        data: { ...this.data(input), createdById: actor.userId, updatedById: actor.userId },
        include: { createdBy: { select: { fullName: true } } },
      });
      await this.record(tx, actor, 'campaign.create', row.id, { title: input.title });
      return row;
    });
    return this.view(created);
  }

  /** Drafts and scheduled campaigns can change (a scheduled one keeps its time). */
  async update(id: string, input: CampaignInput, actor: ContentActor) {
    const current = await this.find(id);
    if (current.status !== 'draft' && current.status !== 'scheduled') throw this.notEditable(current);
    await this.checkTargets(input.audience, input.link);
    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.notificationCampaign.updateMany({
        where: { id, status: current.status },
        data: { ...this.data(input), updatedById: actor.userId },
      });
      if (!count) throw this.notEditable(current);
      await this.record(tx, actor, 'campaign.update', id, { title: input.title });
      return tx.notificationCampaign.findUniqueOrThrow({
        where: { id },
        include: { createdBy: { select: { fullName: true } } },
      });
    });
    return this.view(updated);
  }

  /** Only drafts can be deleted; scheduled ones are cancelled and sent ones stay as a record. */
  async remove(id: string, actor: ContentActor) {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.notificationCampaign.updateMany({
        where: { id, status: 'draft', deletedAt: null },
        data: { deletedAt: new Date(), updatedById: actor.userId },
      });
      if (!count) throw this.notEditable(await this.find(id));
      await this.record(tx, actor, 'campaign.delete', id, {});
    });
  }

  /** How many students an audience reaches now (shown while writing the campaign). */
  async audienceSize(audience: CampaignAudience, excludeIos: boolean) {
    return { recipients: (await this.recipients(audience, excludeIos)).length };
  }

  /** Send now, or schedule when `sendAt` is later than a minute from now. */
  async send(id: string, sendAt: string | null, actor: ContentActor, now = new Date()) {
    const current = await this.find(id);
    if (current.status !== 'draft' && current.status !== 'scheduled') throw this.notEditable(current);
    await this.checkTargets(current.audience as CampaignAudience, current.link as CampaignLink | null);
    const at = sendAt ? new Date(sendAt) : null;
    if (at && at.getTime() > now.getTime() + NOW_SLACK_MS) {
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.notificationCampaign.updateMany({
          where: { id, status: current.status },
          data: { status: 'scheduled', sendAt: at, updatedById: actor.userId },
        });
        if (!count) throw this.notEditable(current);
        await this.record(tx, actor, 'campaign.schedule', id, { sendAt: at.toISOString() });
      });
      return this.get(id);
    }
    if (!(await this.recipients(current.audience as CampaignAudience, current.excludeIos)).length) {
      throw Errors.conflict(ErrorCode.CONFLICT, 'No students match this audience yet');
    }
    const claimed = await this.prisma.notificationCampaign.updateMany({
      where: { id, status: current.status },
      data: { status: 'sending', sendAt: now, updatedById: actor.userId },
    });
    if (!claimed.count) throw this.notEditable(current);
    await this.deliver(id, actor.userId, actor);
    return this.get(id);
  }

  async cancel(id: string, actor: ContentActor) {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.notificationCampaign.updateMany({
        where: { id, status: 'scheduled', deletedAt: null },
        data: { status: 'cancelled', updatedById: actor.userId },
      });
      if (!count) throw this.notEditable(await this.find(id));
      await this.record(tx, actor, 'campaign.cancel', id, {});
    });
    return this.get(id);
  }

  /** Worker: sends scheduled campaigns that are due, and finishes any a stopped worker left half-sent. */
  async dispatchDue(now = new Date()): Promise<number> {
    const due = await this.prisma.notificationCampaign.findMany({
      where: {
        deletedAt: null,
        OR: [
          { status: 'scheduled', sendAt: { lte: now } },
          { status: 'sending', updatedAt: { lt: new Date(now.getTime() - STUCK_MS) } },
        ],
      },
      select: { id: true, status: true, updatedAt: true },
      orderBy: { sendAt: 'asc' },
      take: 10,
    });
    let sent = 0;
    for (const c of due) {
      // Claimed by moving it on (and touching updatedAt), so two workers never send the same one at once.
      const claimed = await this.prisma.notificationCampaign.updateMany({
        where: { id: c.id, status: c.status, updatedAt: c.updatedAt },
        data: { status: 'sending' },
      });
      if (!claimed.count) continue;
      try {
        await this.deliver(c.id, null, null);
        sent++;
      } catch (err) {
        this.logger.error({ err, campaignId: c.id }, 'Campaign send failed; it is retried');
      }
    }
    return sent;
  }

  /** Queues the campaign for its audience as it is now and marks it sent. */
  private async deliver(id: string, actorUserId: string | null, actor: ContentActor | null) {
    const c = await this.prisma.notificationCampaign.findUniqueOrThrow({ where: { id } });
    const recipients = await this.recipients(c.audience as CampaignAudience, c.excludeIos);
    // A link whose course / article / notice is no longer live is left out rather than stopping the send.
    const link = await this.resolveLink(c.link as CampaignLink | null).catch(() => null);
    await this.notifications.notify(recipients, {
      category: 'announcement',
      title: c.title as LocalizedText,
      body: c.message as LocalizedText,
      link,
      sourceKey: `campaign:${c.id}`,
      inApp: true,
      push: c.push,
      email: c.email,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.notificationCampaign.update({
        where: { id },
        data: { status: 'sent', sentAt: new Date(), recipients: recipients.length },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'campaign.sent',
          entityType: 'notification_campaign',
          entityId: id,
          changes: { recipients: recipients.length, push: c.push, email: c.email },
          ...(actor ? { client: actor.client } : {}),
        },
        tx,
      );
    });
  }

  /** The active students an audience reaches now. */
  private async recipients(audience: CampaignAudience, excludeIos: boolean): Promise<string[]> {
    const student = { kind: 'student' as const, status: 'active' as const };
    let ids: string[];
    if (audience.type === 'all') {
      ids = (await this.prisma.user.findMany({ where: student, select: { id: true } })).map((u) => u.id);
    } else if (audience.type === 'courses') {
      ids = await this.entitlements.studentIdsWithCourses(audience.courseIds);
    } else {
      const nodes = await this.withDescendants(audience.examNodeIds);
      const rows = await this.prisma.userTargetPost.findMany({
        where: { examNodeId: { in: [...nodes] }, user: student },
        select: { userId: true },
        distinct: ['userId'],
      });
      ids = rows.map((r) => r.userId);
    }
    if (!excludeIos || !ids.length) return ids;
    const now = new Date();
    const ios = await this.prisma.authSession.findMany({
      where: { platform: 'ios', revokedAt: null, expiresAt: { gt: now }, userId: { in: ids } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const skip = new Set(ios.map((s) => s.userId));
    return ids.filter((id) => !skip.has(id));
  }

  private async withDescendants(ids: string[]): Promise<Set<string>> {
    const all = new Set(ids);
    let frontier = ids;
    for (let depth = 0; frontier.length && depth < 10; depth++) {
      const children = await this.prisma.examNode.findMany({
        where: { parentId: { in: frontier }, deletedAt: null },
        select: { id: true },
      });
      frontier = children.map((c) => c.id).filter((id) => !all.has(id));
      frontier.forEach((id) => all.add(id));
    }
    return all;
  }

  /** The courses / exam categories of the audience exist, and the link is to something students can open. */
  private async checkTargets(audience: CampaignAudience, link: CampaignLink | null) {
    if (audience.type === 'courses') {
      const found = await this.prisma.course.count({
        where: { id: { in: audience.courseIds }, deletedAt: null },
      });
      if (found !== new Set(audience.courseIds).size) {
        throw Errors.validation([{ path: 'audience.courseIds', message: 'A chosen course does not exist' }]);
      }
    }
    if (audience.type === 'exam_nodes') {
      const found = await this.prisma.examNode.count({
        where: { id: { in: audience.examNodeIds }, deletedAt: null },
      });
      if (found !== new Set(audience.examNodeIds).size) {
        throw Errors.validation([
          { path: 'audience.examNodeIds', message: 'A chosen exam category does not exist' },
        ]);
      }
    }
    if (link) await this.resolveLink(link);
  }

  private async resolveLink(link: CampaignLink | null, now = new Date()): Promise<NotificationLink | null> {
    if (!link) return null;
    const invalid = () =>
      Errors.validation([{ path: 'link', message: `The linked ${link.type} is not published` }]);
    if (link.type === 'course') {
      const course = await this.prisma.course.findFirst({
        where: { id: link.id, ...liveWhere(now) },
        select: { slug: true },
      });
      if (!course) throw invalid();
      return { type: 'course', slug: course.slug };
    }
    if (link.type === 'article') {
      const article = await this.prisma.article.findFirst({
        where: { id: link.id, ...liveWhere(now) },
        select: { slug: true },
      });
      if (!article) throw invalid();
      return { type: 'article', slug: article.slug };
    }
    const notice = await this.prisma.notice.findFirst({
      where: {
        id: link.id,
        ...liveWhere(now),
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
      select: { id: true },
    });
    if (!notice) throw invalid();
    return { type: 'notice', id: notice.id };
  }

  private async find(id: string) {
    const row = await this.prisma.notificationCampaign.findFirst({
      where: { id, deletedAt: null },
      include: { createdBy: { select: { fullName: true } } },
    });
    if (!row) throw Errors.notFound('Campaign');
    return row;
  }

  private data(input: CampaignInput) {
    return {
      title: input.title as Prisma.InputJsonValue,
      message: input.message as Prisma.InputJsonValue,
      audience: input.audience as Prisma.InputJsonValue,
      link: (input.link ?? Prisma.DbNull) as Prisma.InputJsonValue,
      push: input.push,
      email: input.email,
      excludeIos: input.excludeIos,
    };
  }

  private notEditable(c: { status: string }) {
    return new AppError(409, ErrorCode.CONFLICT, `This campaign is ${c.status} and cannot be changed`);
  }

  private record(
    tx: Prisma.TransactionClient,
    actor: ContentActor,
    action: string,
    id: string,
    changes: Record<string, unknown>,
  ) {
    return this.audit.record(
      {
        actorUserId: actor.userId,
        action,
        entityType: 'notification_campaign',
        entityId: id,
        changes: changes as Prisma.InputJsonValue,
        client: actor.client,
      },
      tx,
    );
  }

  private view(r: NotificationCampaign & { createdBy: { fullName: string } }) {
    return {
      id: r.id,
      title: r.title as LocalizedText,
      message: r.message as LocalizedText,
      audience: r.audience as CampaignAudience,
      link: (r.link as CampaignLink | null) ?? null,
      push: r.push,
      email: r.email,
      excludeIos: r.excludeIos,
      status: r.status,
      sendAt: r.sendAt?.toISOString() ?? null,
      sentAt: r.sentAt?.toISOString() ?? null,
      recipients: r.recipients,
      createdBy: r.createdBy.fullName,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
