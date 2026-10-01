import { Injectable } from '@nestjs/common';
import type { AdminUserListQuery, UpdateAdminUserInput } from '@tk/contracts';
import type { ClientInfo } from '../../common/auth/auth-context.js';
import { Errors } from '../../common/errors/app-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SessionService, toSessionView } from '../auth/session.service.js';

/** Student account administration. */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminUserListQuery) {
    const where: Prisma.UserWhereInput = {
      kind: 'student',
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { fullName: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
            ],
          }
        : {}),
      ...(query.cursor ? { id: { lt: query.cursor } } : {}),
    };
    const rows = await this.prisma.user.findMany({ where, orderBy: { id: 'desc' }, take: query.limit + 1 });
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        status: u.status,
        emailVerified: Boolean(u.emailVerifiedAt),
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async get(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, kind: 'student' },
      include: {
        sessions: {
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { lastUsedAt: 'desc' },
        },
      },
    });
    if (!user) throw Errors.notFound('Student');
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      phone: user.phone,
      status: user.status,
      locale: user.locale,
      deviceLimitOverride: user.deviceLimitOverride,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      sessions: user.sessions.map((s) => toSessionView(s)),
    };
  }

  async update(userId: string, input: UpdateAdminUserInput, actorUserId: string, client: ClientInfo) {
    const before = await this.prisma.user.findFirst({ where: { id: userId, kind: 'student' } });
    if (!before) throw Errors.notFound('Student');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { deviceLimitOverride: input.deviceLimitOverride },
      });
      await this.audit.record(
        {
          actorUserId,
          action: 'student.update',
          entityType: 'user',
          entityId: userId,
          changes: { before: { deviceLimitOverride: before.deviceLimitOverride }, after: input },
          client,
        },
        tx,
      );
    });
    return this.get(userId);
  }

  async setStatus(userId: string, status: 'active' | 'suspended', actorUserId: string, client: ClientInfo) {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { id: userId, kind: 'student' } });
      if (!user || user.status === 'deleted') throw Errors.notFound('Student');
      await tx.user.update({ where: { id: userId }, data: { status } });
      if (status === 'suspended') await this.sessions.revokeAllForUser(userId, 'suspended', {}, tx);
      await this.audit.record(
        {
          actorUserId,
          action: status === 'suspended' ? 'student.suspend' : 'student.reactivate',
          entityType: 'user',
          entityId: userId,
          changes: { before: user.status, after: status },
          client,
        },
        tx,
      );
    });
  }

  async revokeSessions(userId: string, actorUserId: string, client: ClientInfo) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, kind: 'student' } });
    if (!user) throw Errors.notFound('Student');
    await this.prisma.$transaction(async (tx) => {
      await this.sessions.revokeAllForUser(userId, 'revoked_by_admin', {}, tx);
      await this.audit.record(
        { actorUserId, action: 'student.sessions_revoked', entityType: 'user', entityId: userId, client },
        tx,
      );
    });
  }
}
