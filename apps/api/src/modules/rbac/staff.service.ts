import { Injectable } from '@nestjs/common';
import { ErrorCode, type CreateStaffInput, type RoleInput } from '@tk/contracts';
import type { ClientInfo } from '../../common/auth/auth-context.js';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { OtpService } from '../auth/otp.service.js';
import { SessionService } from '../auth/session.service.js';
import { assertCanGrant, RbacService, type StaffAccess } from './rbac.service.js';

export interface Actor {
  userId: string;
  access: StaffAccess;
  client: ClientInfo;
}

const roleView = (role: {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: { permission: string }[];
  _count?: { users: number };
}) => ({
  id: role.id,
  name: role.name,
  description: role.description,
  isSystem: role.isSystem,
  permissions: role.permissions.map((p) => p.permission).sort(),
  userCount: role._count?.users ?? undefined,
});

/** Roles and staff management (D-036) with privilege-escalation protection. */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
  ) {}

  // ───────────── Roles ─────────────

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      include: { permissions: true, _count: { select: { users: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map(roleView);
  }

  async createRole(input: RoleInput, actor: Actor) {
    assertCanGrant(actor.access, input.permissions);
    return this.prisma.$transaction(async (tx) => {
      const role = await this.withUniqueName(() =>
        tx.role.create({
          data: {
            name: input.name,
            description: input.description ?? null,
            permissions: { create: [...new Set(input.permissions)].map((permission) => ({ permission })) },
          },
          include: { permissions: true },
        }),
      );
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'role.create',
          entityType: 'role',
          entityId: role.id,
          changes: { after: roleView(role) },
          client: actor.client,
        },
        tx,
      );
      return roleView(role);
    });
  }

  async updateRole(roleId: string, input: RoleInput, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.role.findUnique({ where: { id: roleId }, include: { permissions: true } });
      if (!existing) throw Errors.notFound('Role');
      if (existing.isSystem) {
        throw new AppError(409, ErrorCode.SUPER_ADMIN_PROTECTED, 'The Super Admin role cannot be edited');
      }
      // Must hold both the old and the new permissions to edit a role.
      assertCanGrant(actor.access, [...input.permissions, ...existing.permissions.map((p) => p.permission)]);
      await tx.rolePermission.deleteMany({ where: { roleId } });
      const role = await this.withUniqueName(() =>
        tx.role.update({
          where: { id: roleId },
          data: {
            name: input.name,
            description: input.description ?? null,
            permissions: { create: [...new Set(input.permissions)].map((permission) => ({ permission })) },
          },
          include: { permissions: true },
        }),
      );
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'role.update',
          entityType: 'role',
          entityId: role.id,
          changes: { before: roleView(existing), after: roleView(role) },
          client: actor.client,
        },
        tx,
      );
      return roleView(role);
    });
  }

  async deleteRole(roleId: string, actor: Actor) {
    await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({
        where: { id: roleId },
        include: { permissions: true, _count: { select: { users: true } } },
      });
      if (!role) throw Errors.notFound('Role');
      if (role.isSystem)
        throw new AppError(409, ErrorCode.SUPER_ADMIN_PROTECTED, 'The Super Admin role cannot be deleted');
      assertCanGrant(
        actor.access,
        role.permissions.map((p) => p.permission),
      );
      if (role._count.users > 0) {
        throw Errors.conflict(ErrorCode.CONFLICT, 'Remove this role from all staff before deleting it', {
          userCount: role._count.users,
        });
      }
      await tx.role.delete({ where: { id: roleId } });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'role.delete',
          entityType: 'role',
          entityId: roleId,
          changes: { before: roleView(role) },
          client: actor.client,
        },
        tx,
      );
    });
  }

  // ───────────── Staff ─────────────

  async listStaff() {
    const staff = await this.prisma.user.findMany({
      where: { kind: 'staff', status: { not: 'deleted' } },
      include: { roles: { include: { role: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return staff.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      status: u.status,
      hasPassword: Boolean(u.passwordHash),
      mfaEnabled: Boolean(u.mfaEnabledAt),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      roles: u.roles.map((r) => ({ id: r.role.id, name: r.role.name, isSystem: r.role.isSystem })),
    }));
  }

  /** Creates a staff account without a password; the person sets one through the password-reset code we email. */
  async createStaff(input: CreateStaffInput, actor: Actor) {
    const staff = await this.prisma.$transaction(async (tx) => {
      await this.assertCanAssignRoles(tx, input.roleIds, actor);
      let user;
      try {
        user = await tx.user.create({
          data: {
            kind: 'staff',
            email: input.email,
            fullName: input.fullName,
            roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw Errors.conflict(
            ErrorCode.EMAIL_ALREADY_REGISTERED,
            'An account with this email already exists',
          );
        }
        throw err;
      }
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'staff.create',
          entityType: 'user',
          entityId: user.id,
          changes: { after: { email: input.email, fullName: input.fullName, roleIds: input.roleIds } },
          client: actor.client,
        },
        tx,
      );
      return user;
    });
    await this.otp.send({
      purpose: 'reset_password',
      channel: 'email',
      target: input.email,
      userId: staff.id,
      locale: staff.locale,
      wording: 'staff_invite',
    });
    return { id: staff.id };
  }

  async setStaffRoles(userId: string, roleIds: string[], actor: Actor) {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, kind: 'staff' },
        include: { roles: { include: { role: true } } },
      });
      if (!user) throw Errors.notFound('Staff member');
      const currentIds = user.roles.map((r) => r.roleId);
      const removed = currentIds.filter((id) => !roleIds.includes(id));
      const added = roleIds.filter((id) => !currentIds.includes(id));
      // Changing roles requires holding everything being added or removed.
      await this.assertCanAssignRoles(tx, [...added, ...removed], actor);
      const losesSuperAdmin = user.roles.some((r) => r.role.isSystem && removed.includes(r.roleId));
      if (losesSuperAdmin) await this.rbac.assertNotLastSuperAdmin(userId, tx);

      await tx.userRole.deleteMany({ where: { userId, roleId: { in: removed } } });
      if (added.length) await tx.userRole.createMany({ data: added.map((roleId) => ({ userId, roleId })) });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'staff.roles_changed',
          entityType: 'user',
          entityId: userId,
          changes: { before: currentIds, after: roleIds },
          client: actor.client,
        },
        tx,
      );
    });
  }

  async setStaffStatus(userId: string, status: 'active' | 'suspended', actor: Actor) {
    if (userId === actor.userId) throw Errors.forbidden('You cannot change your own status');
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, kind: 'staff', status: { not: 'deleted' } },
      });
      if (!user) throw Errors.notFound('Staff member');
      const targetIsSuperAdmin = await this.rbac.isSuperAdmin(userId, tx);
      if (targetIsSuperAdmin && !actor.access.isSuperAdmin) throw Errors.forbidden();
      if (status === 'suspended' && targetIsSuperAdmin) await this.rbac.assertNotLastSuperAdmin(userId, tx);
      await tx.user.update({ where: { id: userId }, data: { status } });
      if (status === 'suspended') await this.sessions.revokeAllForUser(userId, 'suspended', {}, tx);
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: status === 'suspended' ? 'staff.suspend' : 'staff.reactivate',
          entityType: 'user',
          entityId: userId,
          changes: { before: user.status, after: status },
          client: actor.client,
        },
        tx,
      );
    });
  }

  private async assertCanAssignRoles(tx: Tx, roleIds: string[], actor: Actor): Promise<void> {
    if (roleIds.length === 0) return;
    const roles = await tx.role.findMany({ where: { id: { in: roleIds } }, include: { permissions: true } });
    if (roles.length !== new Set(roleIds).size)
      throw Errors.validation([{ path: 'roleIds', message: 'Unknown role' }]);
    if (roles.some((r) => r.isSystem) && !actor.access.isSuperAdmin) {
      throw Errors.forbidden('Only a Super Admin can grant or remove the Super Admin role');
    }
    assertCanGrant(
      actor.access,
      roles.flatMap((r) => r.permissions.map((p) => p.permission)),
    );
  }

  private async withUniqueName<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw Errors.conflict(ErrorCode.CONFLICT, 'A role with this name already exists');
      }
      throw err;
    }
  }
}
