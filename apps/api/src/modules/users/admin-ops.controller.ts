import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AdminUserListQuery,
  AuditLogQuery,
  isSettingKey,
  isSuperAdminOnlySetting,
  UpdateAdminUserInput,
  UpdateSettingInput,
} from '@tk/contracts';
import type { FastifyRequest } from 'fastify';
import {
  Audiences,
  Client,
  CurrentAuth,
  RequirePermissions,
  type AuthContext,
  type ClientInfo,
} from '../../common/auth/auth-context.js';
import { Errors } from '../../common/errors/app-error.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { AdminUsersService } from './admin-users.service.js';

@ApiTags('admin-ops')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin')
export class AdminOpsController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  // ───────────── Students ─────────────

  @Get('users')
  @RequirePermissions('users:read')
  listUsers(@ZodQuery(AdminUserListQuery) query: AdminUserListQuery) {
    return this.users.list(query);
  }

  @Get('users/:id')
  @RequirePermissions('users:read')
  getUser(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.users.get(id);
  }

  @Patch('users/:id')
  @RequirePermissions('users:update')
  @ApiZodBody(UpdateAdminUserInput)
  updateUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @ZodBody(UpdateAdminUserInput) body: UpdateAdminUserInput,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ) {
    return this.users.update(id, body, auth.userId, client);
  }

  @Post('users/:id/suspend')
  @HttpCode(204)
  @RequirePermissions('users:suspend')
  async suspendUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ) {
    await this.users.setStatus(id, 'suspended', auth.userId, client);
  }

  @Post('users/:id/reactivate')
  @HttpCode(204)
  @RequirePermissions('users:suspend')
  async reactivateUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ) {
    await this.users.setStatus(id, 'active', auth.userId, client);
  }

  @Post('users/:id/revoke-sessions')
  @HttpCode(204)
  @RequirePermissions('users:suspend')
  async revokeSessions(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ) {
    await this.users.revokeSessions(id, auth.userId, client);
  }

  // ───────────── Settings ─────────────

  @Get('settings')
  @RequirePermissions('settings:read')
  listSettings() {
    return this.settings.getAll();
  }

  @Put('settings/:key')
  @RequirePermissions('settings:update')
  @ApiZodBody(UpdateSettingInput)
  async updateSetting(
    @Param('key') key: string,
    @ZodBody(UpdateSettingInput) body: UpdateSettingInput,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
    @Req() req: FastifyRequest,
  ) {
    if (!isSettingKey(key)) throw Errors.notFound('Setting');
    if (isSuperAdminOnlySetting(key) && !req.staffAccess?.isSuperAdmin) {
      throw Errors.forbidden('Only a Super Admin can change this setting');
    }
    return { key, value: await this.settings.update(key, body.value, auth.userId, client) };
  }

  // ───────────── Dashboard ─────────────

  /** Headline numbers for the CMS home screen (more KPIs arrive with later modules). */
  @Get('dashboard')
  @RequirePermissions('users:read')
  async dashboard() {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const [students, activeStudents, newStudents, suspended, pendingDeletion, staff] = await Promise.all([
      this.prisma.user.count({ where: { kind: 'student', status: { not: 'deleted' } } }),
      this.prisma.user.count({ where: { kind: 'student', status: 'active', lastLoginAt: { gte: weekAgo } } }),
      this.prisma.user.count({ where: { kind: 'student', createdAt: { gte: weekAgo } } }),
      this.prisma.user.count({ where: { kind: 'student', status: 'suspended' } }),
      this.prisma.user.count({ where: { kind: 'student', status: 'pending_deletion' } }),
      this.prisma.user.count({ where: { kind: 'staff', status: { not: 'deleted' } } }),
    ]);
    return {
      students,
      activeStudentsLast7Days: activeStudents,
      newStudentsLast7Days: newStudents,
      suspended,
      pendingDeletion,
      staff,
    };
  }

  // ───────────── Audit log ─────────────

  @Get('audit-logs')
  @RequirePermissions('audit:read')
  async auditLogs(@ZodQuery(AuditLogQuery) query: AuditLogQuery) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        entityType: query.entityType,
        entityId: query.entityId,
        actorUserId: query.actorUserId,
        action: query.action,
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const actorIds = [...new Set(page.map((r) => r.actorUserId).filter((id): id is string => Boolean(id)))];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, fullName: true, email: true, kind: true },
    });
    const byId = new Map(actors.map((a) => [a.id, a]));
    return {
      data: page.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        actor: r.actorUserId ? (byId.get(r.actorUserId) ?? null) : null,
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }
}
