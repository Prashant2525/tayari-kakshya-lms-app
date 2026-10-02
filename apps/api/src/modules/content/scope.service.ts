import { Injectable } from '@nestjs/common';
import { ErrorCode, type Permission } from '@tk/contracts';
import type { ClientInfo } from '../../common/auth/auth-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { StaffAccess } from '../rbac/rbac.service.js';

export interface ContentActor {
  userId: string;
  access: StaffAccess;
  client: ClientInfo;
}

const outOfScope = () =>
  new AppError(403, ErrorCode.FORBIDDEN, 'This content is outside the courses or subjects assigned to you');

/**
 * Staff scopes (e.g. instructors) restrict content editing to assigned courses/subjects.
 * Staff without scope rows — and every Super Admin — are unrestricted.
 */
@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** null = unrestricted. */
  async allowedSubjectIds(actor: ContentActor): Promise<Set<string> | null> {
    if (actor.access.isSuperAdmin) return null;
    const scopes = await this.prisma.staffScope.findMany({ where: { userId: actor.userId } });
    if (scopes.length === 0) return null;
    const subjectIds = scopes.filter((s) => s.scopeType === 'subject').map((s) => s.scopeId);
    const courseIds = scopes.filter((s) => s.scopeType === 'course').map((s) => s.scopeId);
    if (courseIds.length) {
      const links = await this.prisma.courseSubject.findMany({ where: { courseId: { in: courseIds } } });
      subjectIds.push(...links.map((l) => l.subjectId));
    }
    return new Set(subjectIds);
  }

  async allowedCourseIds(actor: ContentActor): Promise<Set<string> | null> {
    if (actor.access.isSuperAdmin) return null;
    const scopes = await this.prisma.staffScope.findMany({ where: { userId: actor.userId } });
    if (scopes.length === 0) return null;
    return new Set(scopes.filter((s) => s.scopeType === 'course').map((s) => s.scopeId));
  }

  async assertSubject(actor: ContentActor, subjectId: string): Promise<void> {
    const allowed = await this.allowedSubjectIds(actor);
    if (allowed && !allowed.has(subjectId)) throw outOfScope();
  }

  async assertCourse(actor: ContentActor, courseId: string): Promise<void> {
    const allowed = await this.allowedCourseIds(actor);
    if (allowed && !allowed.has(courseId)) throw outOfScope();
  }

  /** Creating new top-level subjects/courses is for unscoped staff only. */
  async assertUnscoped(actor: ContentActor): Promise<void> {
    if ((await this.allowedSubjectIds(actor)) !== null) throw outOfScope();
  }
}

export function hasPermission(actor: ContentActor, permission: Permission): boolean {
  return actor.access.isSuperAdmin || actor.access.permissions.has(permission);
}

/** Changing live (published/scheduled) content requires the publish permission, so edits cannot bypass review. */
export function assertCanEditLive(actor: ContentActor, status: string, publishPermission: Permission): void {
  if ((status === 'published' || status === 'scheduled') && !hasPermission(actor, publishPermission)) {
    throw new AppError(
      403,
      ErrorCode.FORBIDDEN,
      'This is live. Ask someone who can publish to edit it, or unpublish it first.',
      {
        required: publishPermission,
      },
    );
  }
}
