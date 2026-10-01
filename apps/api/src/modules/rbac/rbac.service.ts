import { Injectable } from '@nestjs/common';
import { ALL_PERMISSIONS, ErrorCode, isPermission, type Permission } from '@tk/contracts';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { PrismaService, type Tx } from '../../infra/prisma/prisma.service.js';

export const SUPER_ADMIN_ROLE_NAME = 'Super Admin';

export interface StaffAccess {
  isSuperAdmin: boolean;
  permissions: ReadonlySet<Permission>;
}

/** Pure rule used by role/staff management: nobody can grant what they do not hold (prevents escalation). */
export function assertCanGrant(actor: StaffAccess, requested: Iterable<string>): void {
  if (actor.isSuperAdmin) return;
  const missing = [...requested].filter((p) => !isPermission(p) || !actor.permissions.has(p));
  if (missing.length > 0) {
    throw new AppError(403, ErrorCode.FORBIDDEN, 'You cannot grant permissions you do not have', { missing });
  }
}

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccess(userId: string, tx?: Tx): Promise<StaffAccess> {
    const db = tx ?? this.prisma;
    const roles = await db.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: true } } },
    });
    if (roles.some((r) => r.role.isSystem)) {
      return { isSuperAdmin: true, permissions: new Set(ALL_PERMISSIONS) };
    }
    const permissions = new Set<Permission>();
    for (const { role } of roles) {
      for (const { permission } of role.permissions) {
        if (isPermission(permission)) permissions.add(permission);
      }
    }
    return { isSuperAdmin: false, permissions };
  }

  /** Idempotently ensures the protected Super Admin role exists. */
  async ensureSuperAdminRole(tx?: Tx) {
    const db = tx ?? this.prisma;
    return db.role.upsert({
      where: { name: SUPER_ADMIN_ROLE_NAME },
      create: {
        name: SUPER_ADMIN_ROLE_NAME,
        description: 'Full access. Protected system role.',
        isSystem: true,
      },
      update: { isSystem: true },
    });
  }

  /** Throws unless at least one other active Super Admin would remain. */
  async assertNotLastSuperAdmin(userId: string, tx?: Tx): Promise<void> {
    const db = tx ?? this.prisma;
    const others = await db.userRole.count({
      where: { role: { isSystem: true }, userId: { not: userId }, user: { status: 'active', kind: 'staff' } },
    });
    if (others === 0) {
      throw new AppError(409, ErrorCode.SUPER_ADMIN_PROTECTED, 'At least one active Super Admin must remain');
    }
  }

  async isSuperAdmin(userId: string, tx?: Tx): Promise<boolean> {
    const db = tx ?? this.prisma;
    return (await db.userRole.count({ where: { userId, role: { isSystem: true } } })) > 0;
  }

  static requireStaffPermission(access: StaffAccess, permission: Permission): void {
    if (!access.isSuperAdmin && !access.permissions.has(permission)) throw Errors.forbidden();
  }
}
