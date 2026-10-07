import { Injectable } from '@nestjs/common';
import type { AdminNoticeQuery, LocalizedText, NoticeInput, NoticeStatusInput } from '@tk/contracts';
import { Errors } from '../../common/errors/app-error.js';
import { Prisma, type Notice } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { mediaIdsIn } from '../content/practice-view.js';
import { assertCanSetStatus, assertSchedule, isLive } from '../content/publishing.js';
import { assertCanEditLive, type ContentActor } from '../content/scope.service.js';
import { MediaService } from '../media/media.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { plainLocalized, shorten } from '../notifications/plain-text.js';

const STUDENT_BATCH = 2000;

/** Live and not expired: what the Notice tab shows. */
const visibleWhere = (now: Date) => ({
  deletedAt: null,
  AND: [
    { OR: [{ status: 'published' as const }, { status: 'scheduled' as const, publishAt: { lte: now } }] },
    { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
  ] as Prisma.NoticeWhereInput[],
});

/**
 * Notices (D-019, D-060): official exam notices, announcements and instructor messages, written in the CMS
 * (`notices:edit`) and published or scheduled by `notices:publish` (D-036). They go to everyone for now (the audience
 * is stored as data). When one with `notify` goes live, the worker queues push and email for every student once.
 */
@Injectable()
export class NoticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────── Students ─────────────

  async live(query: { cursor?: string | undefined; limit: number }, now = new Date()) {
    const rows = await this.prisma.notice.findMany({
      where: visibleWhere(now),
      orderBy: [
        { isPinned: 'desc' },
        { publishAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title as LocalizedText,
        summary: this.summary(n),
        isPinned: n.isPinned,
        publishedAt: (n.publishAt ?? n.createdAt).toISOString(),
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async detail(id: string, now = new Date()) {
    const n = await this.prisma.notice.findFirst({ where: { id, ...visibleWhere(now) } });
    if (!n) throw Errors.notFound('Notice');
    return {
      id: n.id,
      kind: n.kind,
      title: n.title as LocalizedText,
      body: n.body,
      media: await this.media.publicImageUrls([...mediaIdsIn(n.body)]),
      isPinned: n.isPinned,
      publishedAt: (n.publishAt ?? n.createdAt).toISOString(),
    };
  }

  /** Notices published since the student last opened the tab (or since they joined). */
  async unseen(userId: string, now = new Date()) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { noticesSeenAt: true, createdAt: true },
    });
    const since = user.noticesSeenAt ?? user.createdAt;
    const visible = visibleWhere(now);
    return this.prisma.notice.count({
      where: { ...visible, AND: [...visible.AND, { publishAt: { gt: since } }] },
    });
  }

  async markSeen(userId: string, now = new Date()) {
    await this.prisma.user.update({ where: { id: userId }, data: { noticesSeenAt: now } });
  }

  // ───────────── CMS ─────────────

  async list(query: AdminNoticeQuery) {
    const rows = await this.prisma.notice.findMany({
      where: {
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              OR: [
                { title: { path: ['en'], string_contains: query.q } },
                { title: { path: ['ne'], string_contains: query.q } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((n) => this.adminView(n)),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async adminDetail(id: string) {
    const n = await this.find(id);
    return { ...this.adminView(n), body: n.body };
  }

  async create(input: NoticeInput, actor: ContentActor) {
    const notice = await this.prisma.$transaction(async (tx) => {
      const row = await tx.notice.create({
        data: { ...this.data(input), createdById: actor.userId, updatedById: actor.userId },
      });
      await this.log(tx, actor, 'notice.create', row.id, { kind: input.kind, title: input.title });
      return row;
    });
    return { id: notice.id };
  }

  /** T-026: a live notice can be changed only by someone who may publish. */
  async update(id: string, input: NoticeInput, actor: ContentActor) {
    const before = await this.find(id);
    assertCanEditLive(actor, before.status, 'notices:publish');
    await this.prisma.$transaction(async (tx) => {
      await tx.notice.update({ where: { id }, data: { ...this.data(input), updatedById: actor.userId } });
      await this.log(tx, actor, 'notice.update', id, {
        before: { title: before.title },
        after: { title: input.title },
      });
    });
    return this.adminDetail(id);
  }

  async setStatus(id: string, input: NoticeStatusInput, actor: ContentActor, now = new Date()) {
    const before = await this.find(id);
    assertCanSetStatus(actor.access, input.status, 'notices:publish');
    // A published notice keeps the time it first went live (for its date and the "new" badge).
    const publishAt =
      input.status === 'scheduled'
        ? new Date(input.publishAt!)
        : input.status === 'published'
          ? before.publishAt && before.publishAt <= now
            ? before.publishAt
            : now
          : before.publishAt;
    assertSchedule(input.status, input.status === 'scheduled' ? publishAt : null, now);
    await this.prisma.$transaction(async (tx) => {
      await tx.notice.update({
        where: { id },
        data: { status: input.status, publishAt, updatedById: actor.userId },
      });
      await this.log(tx, actor, 'notice.status', id, { before: before.status, after: input.status });
    });
    // Push / email go out with the next worker run (or at the scheduled time).
    return this.adminDetail(id);
  }

  /** Soft delete; archived first if it was live. */
  async remove(id: string, actor: ContentActor) {
    const before = await this.find(id);
    if (isLive(before)) assertCanSetStatus(actor.access, 'archived', 'notices:publish');
    await this.prisma.$transaction(async (tx) => {
      await tx.notice.update({ where: { id }, data: { deletedAt: new Date(), status: 'archived' } });
      await this.log(tx, actor, 'notice.delete', id, { title: before.title });
    });
  }

  /**
   * Worker: notices that went live with `notify` and have not been sent yet are queued for push and email to every
   * active student, once (the notice is claimed first, so two workers cannot both send it).
   */
  async dispatchDue(now = new Date()): Promise<number> {
    const due = await this.prisma.notice.findMany({
      where: { ...visibleWhere(now), notify: true, notifiedAt: null },
      take: 5,
    });
    let dispatched = 0;
    for (const notice of due) {
      const claimed = await this.prisma.notice.updateMany({
        where: { id: notice.id, notifiedAt: null },
        data: { notifiedAt: now },
      });
      if (claimed.count === 0) continue;
      const body = plainLocalized(notice.body as Partial<Record<'en' | 'ne', unknown>>);
      const short = Object.fromEntries(
        Object.entries(body).map(([k, v]) => [k, shorten(v as string, 160)]),
      ) as LocalizedText;
      let cursor: string | undefined;
      for (;;) {
        const students = await this.prisma.user.findMany({
          where: { kind: 'student', status: 'active' },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: STUDENT_BATCH,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (!students.length) break;
        await this.notifications.notify(
          students.map((s) => s.id),
          {
            category: 'notice',
            title: notice.title as LocalizedText,
            body: short,
            link: { type: 'notice', id: notice.id },
            sourceKey: `notice:${notice.id}`,
            inApp: false,
            push: true,
            email: true,
          },
        );
        cursor = students.at(-1)!.id;
        if (students.length < STUDENT_BATCH) break;
      }
      dispatched += 1;
    }
    return dispatched;
  }

  // ───────────── helpers ─────────────

  private summary(n: Notice): LocalizedText {
    const body = plainLocalized(n.body as Partial<Record<'en' | 'ne', unknown>>);
    return Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, shorten(v as string, 200)]),
    ) as LocalizedText;
  }

  private adminView(n: Notice) {
    return {
      id: n.id,
      kind: n.kind,
      title: n.title as LocalizedText,
      isPinned: n.isPinned,
      expiresAt: n.expiresAt?.toISOString() ?? null,
      notify: n.notify,
      notifiedAt: n.notifiedAt?.toISOString() ?? null,
      status: n.status,
      publishAt: n.publishAt?.toISOString() ?? null,
      live: isLive(n),
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    };
  }

  private data(input: NoticeInput) {
    return {
      kind: input.kind,
      title: input.title as Prisma.InputJsonValue,
      body: input.body as Prisma.InputJsonValue,
      isPinned: input.isPinned,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      notify: input.notify,
    };
  }

  private async find(id: string) {
    const n = await this.prisma.notice.findFirst({ where: { id, deletedAt: null } });
    if (!n) throw Errors.notFound('Notice');
    return n;
  }

  private log(tx: Tx, actor: ContentActor, action: string, entityId: string, changes: unknown) {
    return this.audit.record(
      {
        actorUserId: actor.userId,
        action,
        entityType: 'notice',
        entityId,
        changes: changes as Prisma.InputJsonValue,
        client: actor.client,
      },
      tx,
    );
  }
}
