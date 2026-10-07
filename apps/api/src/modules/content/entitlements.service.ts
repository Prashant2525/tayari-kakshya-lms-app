import { Injectable } from '@nestjs/common';
import { ErrorCode, type GrantCourseAccessInput, type LocalizedText } from '@tk/contracts';
import { accessEndsAt, type AccessValidity } from '@tk/domain';
import type { ClientInfo } from '../../common/auth/auth-context.js';
import { AppError, Errors } from '../../common/errors/app-error.js';
import type { Course } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { isLive } from './publishing.js';

/** Activity window shared by every access check. */
export function activeEntitlementWhere(now = new Date()) {
  return {
    status: 'active' as const,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  };
}

/**
 * D-053: premium content needs paid access (a purchase, later a plan), a staff grant, a coupon or a referral. Joining
 * a free course (Enrol) does not unlock premium lessons, answers or tests — lessons belong to subjects that courses
 * share, so it would otherwise unlock them in every paid course with the same subject.
 */
export const premiumSourceWhere = { sourceType: { not: 'free_enrol' as const } };

/** When access starting at `start` ends under the course's validity setting (null = lifetime). */
export function courseAccessEndsAt(
  course: Pick<Course, 'validityType' | 'validityDays' | 'validityEndsOn'>,
  start: Date,
): Date | null {
  const validity: AccessValidity =
    course.validityType === 'days'
      ? { type: 'days', days: course.validityDays ?? 0 }
      : course.validityType === 'fixed_date'
        ? { type: 'fixed_date', endsOn: course.validityEndsOn?.toISOString().slice(0, 10) ?? '' }
        : { type: 'lifetime' };
  return accessEndsAt(validity, start);
}

/** A free course a student can join right now. */
export function isFreeEnrollable(course: Course, now = new Date()): boolean {
  if (course.pricePaisa !== 0 || !isLive(course, now)) return false;
  const endsAt = courseAccessEndsAt(course, now);
  return endsAt === null || endsAt > now;
}

const notEnrollable = (reason: 'not_free' | 'access_period_ended', message: string) =>
  new AppError(409, ErrorCode.ENROLMENT_NOT_AVAILABLE, message, { reason });

/**
 * Access rights to courses. Only server-side flows create them: admin grants now, verified payments in Phase 11.
 * Rows are never deleted; revocation is recorded.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async grantCourse(userId: string, input: GrantCourseAccessInput, actorUserId: string, client: ClientInfo) {
    const [user, course] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: userId, kind: 'student', status: { not: 'deleted' } } }),
      this.prisma.course.findFirst({ where: { id: input.courseId, deletedAt: null } }),
    ]);
    if (!user) throw Errors.notFound('Student');
    if (!course) throw Errors.notFound('Course');
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (endsAt && endsAt <= new Date())
      throw Errors.validation([{ path: 'endsAt', message: 'The end date must be in the future' }]);
    const existing = await this.prisma.entitlement.findFirst({
      where: { userId, courseId: course.id, ...activeEntitlementWhere() },
    });
    if (existing)
      throw new AppError(409, ErrorCode.CONFLICT, 'The student already has access to this course');

    return this.prisma.$transaction(async (tx) => {
      const entitlement = await tx.entitlement.create({
        data: {
          userId,
          scopeType: 'course',
          courseId: course.id,
          sourceType: 'admin_grant',
          endsAt,
          grantedById: actorUserId,
          note: input.note ?? null,
        },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'entitlement.grant',
          entityType: 'entitlement',
          entityId: entitlement.id,
          changes: {
            after: {
              userId,
              courseId: course.id,
              endsAt: endsAt?.toISOString() ?? null,
              note: input.note ?? null,
            },
          },
          client,
        },
        tx,
      );
      return { id: entitlement.id };
    });
  }

  /**
   * Self-service enrolment in a free course (L6: price 0 means "Enrol", not open to all). The access period follows
   * the course's validity setting. Idempotent: enrolling again returns the active access.
   */
  async enrolFree(userId: string, courseId: string, client: ClientInfo, now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      // Serialise concurrent enrol taps by the same student for the same course.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`enrol:${userId}:${courseId}`}))`;
      // Any active access that has not ended counts, whatever its start time: a request that waited on the lock
      // holds an earlier `now` than the one that just enrolled (regression: duplicate rows under concurrent taps).
      const existing = await tx.entitlement.findFirst({
        where: { userId, courseId, status: 'active', OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        orderBy: { endsAt: { sort: 'desc', nulls: 'first' } },
      });
      if (existing) return { enrolled: false, endsAt: existing.endsAt?.toISOString() ?? null };

      const course = await tx.course.findFirst({ where: { id: courseId, deletedAt: null } });
      if (!course || !isLive(course, now)) throw Errors.notFound('Course');
      if (course.pricePaisa !== 0) throw notEnrollable('not_free', 'This course needs to be purchased');
      const endsAt = courseAccessEndsAt(course, now);
      if (endsAt && endsAt <= now)
        throw notEnrollable('access_period_ended', 'Enrolment for this course has closed');

      const entitlement = await tx.entitlement.create({
        data: { userId, scopeType: 'course', courseId, sourceType: 'free_enrol', startsAt: now, endsAt },
      });
      await this.audit.record(
        {
          actorUserId: userId,
          action: 'entitlement.enrol_free',
          entityType: 'entitlement',
          entityId: entitlement.id,
          changes: { after: { userId, courseId, endsAt: endsAt?.toISOString() ?? null } },
          client,
        },
        tx,
      );
      return { enrolled: true, endsAt: endsAt?.toISOString() ?? null };
    });
  }

  async revoke(id: string, reason: string, actorUserId: string, client: ClientInfo) {
    const entitlement = await this.prisma.entitlement.findUnique({ where: { id } });
    if (!entitlement) throw Errors.notFound('Access record');
    if (entitlement.status !== 'active')
      throw new AppError(409, ErrorCode.CONFLICT, 'This access is not active');
    await this.prisma.$transaction(async (tx) => {
      await tx.entitlement.update({
        where: { id },
        data: { status: 'revoked', revokedAt: new Date(), revokedReason: reason },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'entitlement.revoke',
          entityType: 'entitlement',
          entityId: id,
          changes: { reason },
          client,
        },
        tx,
      );
    });
  }

  async listForUser(userId: string) {
    const rows = await this.prisma.entitlement.findMany({
      where: { userId },
      include: {
        course: { select: { id: true, title: true, slug: true } },
        grantedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return rows.map((e) => ({
      id: e.id,
      scopeType: e.scopeType,
      course: e.course
        ? { id: e.course.id, title: e.course.title as LocalizedText, slug: e.course.slug }
        : null,
      sourceType: e.sourceType,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt?.toISOString() ?? null,
      status: e.status === 'active' && e.endsAt && e.endsAt <= now ? 'expired' : e.status,
      grantedBy: e.grantedBy?.fullName ?? null,
      note: e.note,
      revokedReason: e.revokedReason,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  /** Course ids the user can currently access (their courses, free enrolments and their plans' courses). */
  async activeCourseIds(userId: string, now = new Date()): Promise<Set<string>> {
    const rows = await this.prisma.entitlement.findMany({
      where: { userId, scopeType: 'course', ...activeEntitlementWhere(now) },
      select: { courseId: true },
    });
    const ids = new Set(rows.map((r) => r.courseId).filter((id): id is string => Boolean(id)));
    for (const id of await this.planCourseIds(userId, now)) ids.add(id);
    return ids;
  }

  /**
   * Active students with access to any of these courses now — bought, granted, joined free, or through a plan that
   * covers it (course updates and exam reminders, D-060).
   */
  async studentIdsWithCourses(courseIds: string[], now = new Date()): Promise<string[]> {
    if (!courseIds.length) return [];
    const student = { kind: 'student' as const, status: 'active' as const };
    const [direct, plans] = await Promise.all([
      this.prisma.entitlement.findMany({
        where: {
          scopeType: 'course',
          courseId: { in: courseIds },
          ...activeEntitlementWhere(now),
          user: student,
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.entitlement.findMany({
        where: {
          scopeType: 'plan',
          ...activeEntitlementWhere(now),
          user: student,
          plan: {
            OR: [{ coverage: 'all_courses' }, { courses: { some: { courseId: { in: courseIds } } } }],
          },
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);
    return [...new Set([...direct, ...plans].map((e) => e.userId))];
  }

  /** Whether the user has an active plan (any). */
  async hasActivePlan(userId: string, now = new Date()): Promise<boolean> {
    const count = await this.prisma.entitlement.count({
      where: { userId, scopeType: 'plan', ...activeEntitlementWhere(now) },
    });
    return count > 0;
  }

  /**
   * Courses the user's active plans cover (D-054): each plan's courses as they are now, or every course for an
   * all-courses plan. A plan staff later delete keeps giving access to subscribers until it ends.
   */
  async planCourseIds(userId: string, now = new Date()): Promise<Set<string>> {
    const plans = await this.prisma.entitlement.findMany({
      where: { userId, scopeType: 'plan', ...activeEntitlementWhere(now) },
      select: { plan: { select: { coverage: true, courses: { select: { courseId: true } } } } },
    });
    if (plans.some((p) => p.plan?.coverage === 'all_courses')) {
      const all = await this.prisma.course.findMany({ where: { deletedAt: null }, select: { id: true } });
      return new Set(all.map((c) => c.id));
    }
    return new Set(plans.flatMap((p) => p.plan?.courses.map((c) => c.courseId) ?? []));
  }

  /** Course ids whose premium content the user can open (D-053: not through a free enrolment; plans count). */
  async premiumCourseIds(userId: string, now = new Date()): Promise<Set<string>> {
    const rows = await this.prisma.entitlement.findMany({
      where: { userId, scopeType: 'course', ...activeEntitlementWhere(now), ...premiumSourceWhere },
      select: { courseId: true },
    });
    const ids = new Set(rows.map((r) => r.courseId).filter((id): id is string => Boolean(id)));
    for (const id of await this.planCourseIds(userId, now)) ids.add(id);
    return ids;
  }

  /** True if the user has premium access (D-053) to a course that includes this subject. */
  async hasSubjectAccess(userId: string, subjectId: string, now = new Date()): Promise<boolean> {
    const count = await this.prisma.entitlement.count({
      where: {
        userId,
        scopeType: 'course',
        ...activeEntitlementWhere(now),
        ...premiumSourceWhere,
        course: { deletedAt: null, subjects: { some: { subjectId } } },
      },
    });
    if (count > 0) return true;
    // Or a plan covering a course that includes this subject.
    const planCourses = await this.planCourseIds(userId, now);
    if (planCourses.size === 0) return false;
    const covering = await this.prisma.courseSubject.count({
      where: { subjectId, courseId: { in: [...planCourses] }, course: { deletedAt: null } },
    });
    return covering > 0;
  }
}
