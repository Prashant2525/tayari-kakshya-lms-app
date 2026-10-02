import type { Permission, PublishStatus } from '@tk/contracts';
import { ErrorCode } from '@tk/contracts';
import { AppError } from '../../common/errors/app-error.js';
import type { StaffAccess } from '../rbac/rbac.service.js';

const EDITOR_STATUSES: ReadonlySet<PublishStatus> = new Set(['draft', 'in_review']);

/**
 * Editors may move content between draft and in_review; publishing, scheduling and archiving need the publish
 * permission (D-036: users without it submit for review).
 */
export function assertCanSetStatus(
  access: StaffAccess,
  status: PublishStatus,
  publishPermission: Permission,
): void {
  if (EDITOR_STATUSES.has(status)) return;
  if (access.isSuperAdmin || access.permissions.has(publishPermission)) return;
  throw new AppError(
    403,
    ErrorCode.FORBIDDEN,
    'You can submit this for review, but publishing needs another role',
    {
      required: publishPermission,
    },
  );
}

export function assertSchedule(status: PublishStatus, publishAt: Date | null, now = new Date()): void {
  if (status === 'scheduled' && (!publishAt || publishAt <= now)) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_FAILED,
      'Scheduled content needs a publish time in the future',
    );
  }
}

/** Visible to students: published, or scheduled and due. Evaluated at read time, so no job is needed to go live. */
export function isLive(
  item: { status: PublishStatus; publishAt?: Date | null; deletedAt?: Date | null },
  now = new Date(),
) {
  if (item.deletedAt) return false;
  return (
    item.status === 'published' || (item.status === 'scheduled' && !!item.publishAt && item.publishAt <= now)
  );
}

/** Prisma filter for live rows of models that support scheduling. */
export function liveWhere(now = new Date()) {
  return {
    deletedAt: null,
    OR: [{ status: 'published' as const }, { status: 'scheduled' as const, publishAt: { lte: now } }],
  };
}

/** Prisma filter for live rows of models without a publish time (taxonomy, subjects, chapters, topics, papers). */
export const publishedWhere = { deletedAt: null, status: 'published' as const };
