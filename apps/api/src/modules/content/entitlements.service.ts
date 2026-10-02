import { Injectable } from '@nestjs/common';
import { ErrorCode, type GrantCourseAccessInput, type LocalizedText } from '@tk/contracts';
import type { ClientInfo } from '../../common/auth/auth-context.js';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

/** Activity window shared by every access check. */
export function activeEntitlementWhere(now = new Date()) {
  return {
    status: 'active' as const,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  };
}

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

  /** Course ids the user can currently access. */
  async activeCourseIds(userId: string, now = new Date()): Promise<Set<string>> {
    const rows = await this.prisma.entitlement.findMany({
      where: { userId, scopeType: 'course', ...activeEntitlementWhere(now) },
      select: { courseId: true },
    });
    return new Set(rows.map((r) => r.courseId).filter((id): id is string => Boolean(id)));
  }

  /** True if any active course entitlement covers a course that includes this subject. */
  async hasSubjectAccess(userId: string, subjectId: string, now = new Date()): Promise<boolean> {
    const count = await this.prisma.entitlement.count({
      where: {
        userId,
        scopeType: 'course',
        ...activeEntitlementWhere(now),
        course: { deletedAt: null, subjects: { some: { subjectId } } },
      },
    });
    return count > 0;
  }
}
