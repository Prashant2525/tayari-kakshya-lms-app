import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type AdminDiscussionQuery,
  type CursorQuery,
  type DiscussionBanInput,
  type DiscussionPostInput,
  type DiscussionPostView,
  type DiscussionTarget,
  type LocalizedText,
  type QuestionContent,
  type ReportPostInput,
} from '@tk/contracts';
import { leaderboardName, resultsReleased } from '@tk/domain';
import { AppError, Errors } from '../../common/errors/app-error.js';
import type { DiscussionPost, Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { EntitlementsService } from '../content/entitlements.service.js';
import { visibleQuestion } from '../content/practice.service.js';
import { liveWhere, publishedWhere } from '../content/publishing.js';
import type { ContentActor } from '../content/scope.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { stemPreview } from '../questions/questions.service.js';
import { SettingsService } from '../settings/settings.service.js';

const notFound = () => Errors.notFound('Discussion');
const postNotFound = () => Errors.notFound('Post');

type PostWithPeople = DiscussionPost & {
  user: { id: string; kind: string; fullName: string; instructorProfile: { displayName: unknown } | null };
};
const people = {
  user: {
    select: { id: true, kind: true, fullName: true, instructorProfile: { select: { displayName: true } } },
  },
} satisfies Prisma.DiscussionPostInclude;

/**
 * Discussions / doubts (S12, D-066, T-067). A thread belongs to a question or a lesson. Students read and post when
 * they can open the lesson, or — for a question — once they can see its answer and have answered it (practice,
 * revision, or a test whose results are out), so a thread never gives answers away. Posts show at once; replies are one
 * level deep; staff reply from the CMS with a Teacher badge, mark the best answer, hide posts (reports close) and stop
 * a student posting. Every staff action is audited.
 */
@Injectable()
export class DiscussionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── Students ─────────────

  async thread(userId: string, target: DiscussionTarget, targetId: string, query: CursorQuery) {
    await this.assertCanJoin(userId, target, targetId);
    const [page, count, ban] = await Promise.all([
      this.page(target, targetId, query, userId, false),
      this.prisma.discussionPost.count({ where: { targetType: target, targetId, status: 'visible' } }),
      this.activeBan(userId),
    ]);
    return { ...page, count, canPost: !ban, bannedUntil: ban?.until?.toISOString() ?? null };
  }

  async post(userId: string, target: DiscussionTarget, targetId: string, input: DiscussionPostInput) {
    await this.assertCanJoin(userId, target, targetId);
    const ban = await this.activeBan(userId);
    if (ban) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'You cannot post in discussions at the moment', {
        until: ban.until?.toISOString() ?? null,
      });
    }
    return this.create(userId, target, targetId, input);
  }

  /** The author removes a post: gone, or kept as "deleted" while it still has replies. */
  async removeOwn(userId: string, postId: string): Promise<void> {
    const post = await this.prisma.discussionPost.findFirst({
      where: { id: postId, userId, status: { not: 'deleted' } },
      include: { _count: { select: { replies: { where: { status: 'visible' } } } } },
    });
    if (!post) throw postNotFound();
    if (post._count.replies > 0) {
      await this.prisma.discussionPost.update({
        where: { id: postId },
        data: { status: 'deleted', body: '' },
      });
    } else {
      await this.prisma.discussionPost.delete({ where: { id: postId } });
    }
  }

  async report(userId: string, postId: string, input: ReportPostInput): Promise<void> {
    const post = await this.prisma.discussionPost.findFirst({ where: { id: postId, status: 'visible' } });
    if (!post) throw postNotFound();
    await this.assertCanJoin(userId, post.targetType, post.targetId);
    if (post.userId === userId)
      throw Errors.validation([{ path: 'postId', message: 'You cannot report your own post' }]);
    await this.prisma.discussionReport.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId, reason: input.reason, message: input.message ?? null },
      update: { reason: input.reason, message: input.message ?? null, open: true },
    });
  }

  // ───────────── Staff ─────────────

  async adminList(query: AdminDiscussionQuery) {
    const where: Prisma.DiscussionPostWhereInput =
      query.view === 'reported'
        ? { reports: { some: { open: true } }, status: { not: 'deleted' } }
        : query.view === 'hidden'
          ? { status: 'hidden' }
          : { status: 'visible' };
    const rows = await this.prisma.discussionPost.findMany({
      where: { ...where, ...(query.cursor ? { id: { lt: query.cursor } } : {}) },
      include: {
        ...people,
        user: { select: { ...people.user.select, email: true, discussionBan: true } },
        reports: { where: { open: true }, select: { reason: true, message: true } },
        parent: { select: { body: true } },
        hiddenBy: { select: { fullName: true } },
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const contexts = await this.contexts(page);
    return {
      data: page.map((p) => ({
        id: p.id,
        target: p.targetType,
        targetId: p.targetId,
        context: contexts.get(`${p.targetType}:${p.targetId}`) ?? null,
        parentId: p.parentId,
        parentBody: p.parent?.body ?? null,
        body: p.body,
        status: p.status,
        best: p.isBest,
        author: {
          id: p.user.id,
          name: p.user.fullName,
          email: p.user.email,
          staff: p.user.kind === 'staff',
          bannedUntil: p.user.discussionBan ? (p.user.discussionBan.until?.toISOString() ?? 'forever') : null,
        },
        reports: p.reports,
        hiddenReason: p.hiddenReason,
        hiddenBy: p.hiddenBy?.fullName ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  /** The whole thread for staff, hidden posts included (marked). */
  async adminThread(target: DiscussionTarget, targetId: string, query: CursorQuery) {
    const context = (await this.contexts([{ targetType: target, targetId }])).get(`${target}:${targetId}`);
    if (!context) throw notFound();
    return { context, ...(await this.page(target, targetId, query, null, true)) };
  }

  /** A teacher's post or reply (no access rules: staff see every thread). */
  async staffPost(
    actor: ContentActor,
    target: DiscussionTarget,
    targetId: string,
    input: DiscussionPostInput,
  ) {
    const context = (await this.contexts([{ targetType: target, targetId }])).get(`${target}:${targetId}`);
    if (!context) throw notFound();
    const created = await this.create(actor.userId, target, targetId, input);
    await this.record(this.prisma, actor, 'discussion.staff_post', created.id, { target, targetId });
    return created;
  }

  async hide(id: string, reason: string, actor: ContentActor) {
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.discussionPost.findUnique({ where: { id } });
      if (!post || post.status === 'deleted') throw postNotFound();
      await tx.discussionPost.update({
        where: { id },
        data: {
          status: 'hidden',
          hiddenReason: reason,
          hiddenById: actor.userId,
          hiddenAt: new Date(),
          isBest: false,
        },
      });
      await tx.discussionReport.updateMany({ where: { postId: id, open: true }, data: { open: false } });
      await this.record(tx, actor, 'discussion.hide', id, { reason });
      return { id, status: 'hidden' as const };
    });
  }

  async unhide(id: string, actor: ContentActor) {
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.discussionPost.findUnique({ where: { id } });
      if (!post || post.status !== 'hidden') throw postNotFound();
      await tx.discussionPost.update({
        where: { id },
        data: { status: 'visible', hiddenReason: null, hiddenById: null, hiddenAt: null },
      });
      await this.record(tx, actor, 'discussion.unhide', id, {});
      return { id, status: 'visible' as const };
    });
  }

  /** Reports looked at and the post kept. */
  async dismissReports(id: string, actor: ContentActor) {
    const closed = await this.prisma.discussionReport.updateMany({
      where: { postId: id, open: true },
      data: { open: false },
    });
    if (!closed.count) throw Errors.notFound('Open report');
    await this.record(this.prisma, actor, 'discussion.dismiss_reports', id, { reports: closed.count });
  }

  /** Marks a reply as the best answer to its doubt (one per doubt), or clears it. */
  async setBest(id: string, best: boolean, actor: ContentActor) {
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.discussionPost.findUnique({ where: { id } });
      if (!post || post.status !== 'visible') throw postNotFound();
      if (!post.parentId)
        throw Errors.validation([{ path: 'id', message: 'Only a reply can be the best answer' }]);
      if (best)
        await tx.discussionPost.updateMany({
          where: { parentId: post.parentId, isBest: true },
          data: { isBest: false },
        });
      await tx.discussionPost.update({ where: { id }, data: { isBest: best } });
      await this.record(tx, actor, best ? 'discussion.best' : 'discussion.best_cleared', id, {});
      return { id, best };
    });
  }

  async ban(userId: string, input: DiscussionBanInput, actor: ContentActor) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, kind: 'student' } });
    if (!user) throw Errors.notFound('Student');
    const until = input.until ? new Date(input.until) : null;
    if (until && until <= new Date())
      throw Errors.validation([{ path: 'until', message: 'Choose a time in the future' }]);
    await this.prisma.$transaction(async (tx) => {
      await tx.discussionBan.upsert({
        where: { userId },
        create: { userId, until, reason: input.reason, createdById: actor.userId },
        update: { until, reason: input.reason, createdById: actor.userId, createdAt: new Date() },
      });
      await this.record(
        tx,
        actor,
        'discussion.ban',
        userId,
        { until: input.until, reason: input.reason },
        'user',
      );
    });
  }

  async unban(userId: string, actor: ContentActor) {
    const removed = await this.prisma.discussionBan.deleteMany({ where: { userId } });
    if (!removed.count) throw Errors.notFound('Posting ban');
    await this.record(this.prisma, actor, 'discussion.unban', userId, {}, 'user');
  }

  // ───────────── helpers ─────────────

  private async create(
    userId: string,
    target: DiscussionTarget,
    targetId: string,
    input: DiscussionPostInput,
  ) {
    let parent: DiscussionPost | null = null;
    if (input.parentId) {
      parent = await this.prisma.discussionPost.findFirst({
        where: { id: input.parentId, targetType: target, targetId, parentId: null, status: 'visible' },
      });
      if (!parent)
        throw Errors.validation([{ path: 'parentId', message: 'Reply to a question in this discussion' }]);
    }
    const created = await this.prisma.discussionPost.create({
      data: { targetType: target, targetId, parentId: parent?.id ?? null, userId, body: input.body },
      include: people,
    });
    // The person who asked hears about replies (push and in-app; never email).
    if (parent && parent.userId !== userId) {
      const excerpt = created.body.length > 120 ? `${created.body.slice(0, 117)}…` : created.body;
      await this.notifications.notify([parent.userId], {
        category: 'discussion',
        title: { en: 'New reply to your question', ne: 'तपाईंको प्रश्नमा नयाँ जवाफ' },
        body: { en: excerpt, ne: excerpt },
        link: { type: 'discussion', target, id: targetId },
        sourceKey: `discussion-reply:${created.id}`,
        inApp: true,
        push: true,
        email: false,
      });
    }
    const names = await this.names();
    return this.view(created, userId, names);
  }

  /** Top-level posts, newest first, each with its replies oldest first. */
  private async page(
    target: DiscussionTarget,
    targetId: string,
    query: CursorQuery,
    viewerId: string | null,
    staff: boolean,
  ) {
    const shown: Prisma.DiscussionPostWhereInput = staff
      ? { status: { not: 'deleted' } }
      : { status: 'visible' };
    const rows = await this.prisma.discussionPost.findMany({
      where: {
        targetType: target,
        targetId,
        parentId: null,
        // A deleted doubt stays as a placeholder while it has replies others can read.
        OR: [shown, { status: 'deleted', replies: { some: { status: 'visible' } } }],
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      include: {
        ...people,
        replies: { where: shown, include: people, orderBy: { id: 'asc' } },
        ...(staff ? { reports: { where: { open: true }, select: { reason: true } } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const pageRows = rows.slice(0, query.limit);
    const names = await this.names();
    return {
      data: pageRows.map((p) => ({
        ...this.view(p, viewerId, names),
        ...(staff ? { status: p.status, hiddenReason: p.hiddenReason } : {}),
        replies: p.replies.map((r) => ({
          ...this.view(r, viewerId, names),
          ...(staff ? { status: r.status, hiddenReason: r.hiddenReason } : {}),
        })),
      })),
      nextCursor: rows.length > query.limit ? (pageRows.at(-1)?.id ?? null) : null,
    };
  }

  private view(
    p: PostWithPeople,
    viewerId: string | null,
    names: 'first_initial' | 'full',
  ): DiscussionPostView {
    const deleted = p.status === 'deleted';
    const staff = p.user.kind === 'staff';
    const teacher = p.user.instructorProfile?.displayName as LocalizedText | undefined;
    return {
      id: p.id,
      parentId: p.parentId,
      body: deleted ? '' : p.body,
      author: deleted
        ? ''
        : staff
          ? (teacher?.en ?? p.user.fullName)
          : (leaderboardName(p.user.fullName, names) ?? ''),
      staff: !deleted && staff,
      mine: viewerId !== null && p.userId === viewerId,
      best: p.isBest,
      deleted,
      createdAt: p.createdAt.toISOString(),
    };
  }

  private async names() {
    return (await this.settings.get('discussions.rules')).names;
  }

  private async activeBan(userId: string) {
    const ban = await this.prisma.discussionBan.findUnique({ where: { userId } });
    if (!ban || (ban.until && ban.until <= new Date())) return null;
    return ban;
  }

  /** Students join a lesson's thread when they can open it; a question's once they have seen and answered it. */
  private async assertCanJoin(userId: string, target: DiscussionTarget, targetId: string): Promise<void> {
    if (target === 'lesson') {
      const item = await this.prisma.learningItem.findFirst({
        where: {
          id: targetId,
          ...liveWhere(),
          topic: { ...publishedWhere, chapter: { ...publishedWhere, subject: publishedWhere } },
        },
        select: { accessLevel: true, topic: { select: { chapter: { select: { subjectId: true } } } } },
      });
      if (!item) throw notFound();
      if (
        item.accessLevel === 'premium' &&
        !(await this.entitlements.hasSubjectAccess(userId, item.topic.chapter.subjectId))
      ) {
        throw new AppError(403, ErrorCode.CONTENT_LOCKED, 'This lesson needs access to its course');
      }
      return;
    }
    const q = await this.prisma.question.findFirst({
      where: { ...visibleQuestion, id: targetId },
      select: { accessLevel: true, subjectId: true, currentVersion: { select: { content: true } } },
    });
    if (!q) throw notFound();
    const now = new Date();
    const [practised, mistake, tested] = await Promise.all([
      this.prisma.practiceAnswer.count({ where: { userId, questionId: targetId } }),
      this.prisma.mistake.findUnique({ where: { userId_questionId: { userId, questionId: targetId } } }),
      this.prisma.attemptAnswer.findMany({
        where: { questionId: targetId, attempt: { userId, status: 'completed' } },
        select: { attempt: { select: { assessment: true } } },
      }),
    ]);
    const released = tested.filter((t) => resultsReleased(t.attempt.assessment, now));
    const solutionsSeen =
      released.some((t) => t.attempt.assessment.showExplanations) || Boolean(mistake?.answerVisible);
    const canSeeAnswer =
      q.accessLevel === 'free' ||
      solutionsSeen ||
      (await this.entitlements.hasSubjectAccess(userId, q.subjectId));
    const written = (q.currentVersion?.content as QuestionContent | undefined)?.type === 'subjective';
    const answered = practised > 0 || Boolean(mistake) || released.length > 0;
    if (!canSeeAnswer || !(answered || written)) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Answer the question first to see its discussion');
    }
  }

  /** What each thread is about, for the CMS (question preview / lesson title, with the subject). */
  private async contexts(posts: Array<{ targetType: DiscussionTarget; targetId: string }>) {
    const ids = (type: DiscussionTarget) => [
      ...new Set(posts.filter((p) => p.targetType === type).map((p) => p.targetId)),
    ];
    const [questions, lessons] = await Promise.all([
      this.prisma.question.findMany({
        where: { id: { in: ids('question') } },
        select: {
          id: true,
          currentVersion: { select: { content: true } },
          subject: { select: { name: true } },
        },
      }),
      this.prisma.learningItem.findMany({
        where: { id: { in: ids('lesson') } },
        select: {
          id: true,
          title: true,
          topic: { select: { chapter: { select: { subject: { select: { name: true } } } } } },
        },
      }),
    ]);
    const map = new Map<string, { title: string; subject: LocalizedText }>();
    for (const q of questions) {
      map.set(`question:${q.id}`, {
        title: stemPreview(q.currentVersion?.content as QuestionContent | undefined),
        subject: q.subject.name as LocalizedText,
      });
    }
    for (const l of lessons) {
      map.set(`lesson:${l.id}`, {
        title: (l.title as LocalizedText).en ?? (l.title as LocalizedText).ne ?? '',
        subject: l.topic.chapter.subject.name as LocalizedText,
      });
    }
    return map;
  }

  private record(
    db: Tx | PrismaService,
    actor: ContentActor,
    action: string,
    entityId: string,
    changes: unknown,
    entityType = 'discussion_post',
  ) {
    return this.audit.record(
      {
        actorUserId: actor.userId,
        action,
        entityType,
        entityId,
        changes: changes as Prisma.InputJsonValue,
        client: actor.client,
      },
      db as Tx,
    );
  }
}
