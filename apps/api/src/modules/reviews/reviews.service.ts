import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type AdminReviewQuery,
  type CursorQuery,
  type LocalizedText,
  type PublicReview,
  type RatingSummary,
  type ReviewInput,
} from '@tk/contracts';
import { leaderboardName } from '@tk/domain';
import { AppError, Errors } from '../../common/errors/app-error.js';
import type { CourseReview, Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { courseProgress } from '../content/course-progress.js';
import { EntitlementsService } from '../content/entitlements.service.js';
import { isLive } from '../content/publishing.js';
import type { ContentActor } from '../content/scope.service.js';
import { SettingsService } from '../settings/settings.service.js';

const notFound = () => Errors.notFound('Review');

/**
 * Course reviews (S4, D-066, T-066). A student who has a course and has finished at least the CMS share of its lessons
 * may give it 1–5 stars and an optional text; staff approve or reject each review before anyone sees it, and a
 * changed review waits for approval again. Ratings (average and count) come from approved reviews only.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** Approved reviews' average (one decimal) and count, per course. */
  async ratings(courseIds: string[]): Promise<Map<string, RatingSummary>> {
    if (!courseIds.length) return new Map();
    const rows = await this.prisma.courseReview.groupBy({
      by: ['courseId'],
      where: { courseId: { in: courseIds }, status: 'approved' },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return new Map(
      rows.map((r) => [
        r.courseId,
        { average: Math.round((r._avg.rating ?? 0) * 10) / 10, count: r._count._all },
      ]),
    );
  }

  /** Approved reviews of a live course, newest first, with the rating and how many gave each star. */
  async publicList(slug: string, query: CursorQuery) {
    const course = await this.prisma.course.findFirst({ where: { slug, deletedAt: null } });
    if (!course || !isLive(course)) throw Errors.notFound('Course');
    const { names } = await this.settings.get('reviews.rules');
    const rows = await this.prisma.courseReview.findMany({
      where: {
        courseId: course.id,
        status: 'approved',
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      include: { user: { select: { fullName: true } } },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const stars = await this.prisma.courseReview.groupBy({
      by: ['rating'],
      where: { courseId: course.id, status: 'approved' },
      _count: { _all: true },
    });
    const count = stars.reduce((sum, s) => sum + s._count._all, 0);
    const total = stars.reduce((sum, s) => sum + s.rating * s._count._all, 0);
    return {
      summary: {
        average: count ? Math.round((total / count) * 10) / 10 : 0,
        count,
        stars: Object.fromEntries(
          [5, 4, 3, 2, 1].map((n) => [n, stars.find((s) => s.rating === n)?._count._all ?? 0]),
        ) as Record<'1' | '2' | '3' | '4' | '5', number>,
      },
      data: page.map((r): PublicReview => ({
        id: r.id,
        rating: r.rating,
        body: r.body,
        author: leaderboardName(r.user.fullName, names),
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  /** The student's own review of a course (any status) and whether they may write one. */
  async mine(userId: string, courseId: string) {
    const [review, eligibility] = await Promise.all([
      this.prisma.courseReview.findUnique({ where: { courseId_userId: { courseId, userId } } }),
      this.eligibility(userId, courseId),
    ]);
    if (!eligibility.hasCourse && !review) throw Errors.notFound('Course');
    return {
      ...eligibility,
      review: review
        ? {
            rating: review.rating,
            body: review.body,
            status: review.status,
            rejectionReason: review.rejectionReason,
            updatedAt: review.updatedAt.toISOString(),
          }
        : null,
    };
  }

  async save(userId: string, courseId: string, input: ReviewInput) {
    const e = await this.eligibility(userId, courseId);
    if (!e.hasCourse) throw Errors.notFound('Course');
    if (!e.canReview) {
      throw new AppError(
        403,
        ErrorCode.REVIEW_NOT_ALLOWED,
        `Finish at least ${e.requiredPercent}% of the lessons to review this course`,
        { requiredPercent: e.requiredPercent, progressPercent: e.progressPercent },
      );
    }
    const data = { rating: input.rating, body: input.body ?? null };
    // A changed review is checked again before it is shown.
    await this.prisma.courseReview.upsert({
      where: { courseId_userId: { courseId, userId } },
      create: { courseId, userId, ...data },
      update: { ...data, status: 'pending', rejectionReason: null, moderatedById: null, moderatedAt: null },
    });
    return this.mine(userId, courseId);
  }

  async remove(userId: string, courseId: string): Promise<void> {
    const removed = await this.prisma.courseReview.deleteMany({ where: { courseId, userId } });
    if (!removed.count) throw notFound();
  }

  // ───────────── Staff ─────────────

  async adminList(query: AdminReviewQuery) {
    const rows = await this.prisma.courseReview.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.courseId ? { courseId: query.courseId } : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      include: {
        course: { select: { id: true, title: true, slug: true } },
        user: { select: { id: true, fullName: true, email: true } },
        moderatedBy: { select: { fullName: true } },
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((r) => ({
        id: r.id,
        rating: r.rating,
        body: r.body,
        status: r.status,
        rejectionReason: r.rejectionReason,
        course: { id: r.course.id, title: r.course.title as LocalizedText, slug: r.course.slug },
        student: r.user,
        moderatedBy: r.moderatedBy?.fullName ?? null,
        moderatedAt: r.moderatedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async approve(id: string, actor: ContentActor) {
    return this.moderate(id, actor, { status: 'approved', rejectionReason: null }, 'review.approve');
  }

  async reject(id: string, reason: string, actor: ContentActor) {
    return this.moderate(id, actor, { status: 'rejected', rejectionReason: reason }, 'review.reject');
  }

  private async moderate(
    id: string,
    actor: ContentActor,
    data: Pick<CourseReview, 'status' | 'rejectionReason'>,
    action: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.courseReview.findUnique({ where: { id } });
      if (!review) throw notFound();
      const now = new Date();
      await tx.courseReview.update({
        where: { id },
        data: { ...data, moderatedById: actor.userId, moderatedAt: now },
      });
      await this.record(tx, actor, action, id, { from: review.status, ...data });
      return { id, status: data.status };
    });
  }

  private record(tx: Tx, actor: ContentActor, action: string, entityId: string, changes: unknown) {
    return this.audit.record(
      {
        actorUserId: actor.userId,
        action,
        entityType: 'course_review',
        entityId,
        changes: changes as Prisma.InputJsonValue,
        client: actor.client,
      },
      tx,
    );
  }

  /** Has the course now, and has finished at least the CMS share of its lessons. */
  private async eligibility(userId: string, courseId: string) {
    const [active, rules, progress] = await Promise.all([
      this.entitlements.activeCourseIds(userId),
      this.settings.get('reviews.rules'),
      courseProgress(this.prisma, userId, [courseId]),
    ]);
    const p = progress.get(courseId) ?? { completed: 0, total: 0 };
    const progressPercent = p.total ? Math.floor((p.completed * 100) / p.total) : 0;
    const hasCourse = active.has(courseId);
    return {
      hasCourse,
      progressPercent,
      requiredPercent: rules.minProgressPercent,
      canReview: hasCourse && progressPercent >= rules.minProgressPercent,
    };
  }
}
