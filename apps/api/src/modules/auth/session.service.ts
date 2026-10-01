import { Injectable } from '@nestjs/common';
import { ErrorCode, type AuthTokens, type DeviceInfo, type SessionView } from '@tk/contracts';
import type { Audience, ClientInfo } from '../../common/auth/auth-context.js';
import { AppError, Errors } from '../../common/errors/app-error.js';
import type { AuthSession } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { TokenService } from './token.service.js';

export interface SessionOwner {
  id: string;
  deviceLimitOverride: number | null;
}

export function toSessionView(s: AuthSession, currentSessionId?: string): SessionView {
  return {
    id: s.id,
    deviceName: s.deviceName,
    platform: s.platform,
    lastUsedAt: s.lastUsedAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
    current: s.id === currentSessionId,
  };
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Opens a session for a verified login. Serialized per user (advisory lock) so concurrent logins cannot
   * exceed the device limit.
   */
  async open(params: {
    user: SessionOwner;
    audience: Audience;
    device: DeviceInfo;
    client: ClientInfo;
    replaceSessionId?: string;
  }): Promise<AuthTokens> {
    const { user, audience, device, client } = params;
    const refreshToken = this.tokens.generateRefreshToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.tokens.refreshTtlMs);

    const session = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;

      if (params.replaceSessionId) {
        await tx.authSession.updateMany({
          where: { id: params.replaceSessionId, userId: user.id, revokedAt: null },
          data: { revokedAt: now, revokeReason: 'replaced_at_login' },
        });
      }
      // Logging in again on the same device replaces that device's previous session.
      await tx.authSession.updateMany({
        where: { userId: user.id, audience, deviceId: device.deviceId, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'replaced_by_new_login' },
      });
      if (audience === 'student') await this.enforceDeviceLimit(tx, user, now);

      const created = await tx.authSession.create({
        data: {
          userId: user.id,
          audience,
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          platform: device.platform,
          ip: client.ip,
          userAgent: client.userAgent,
          expiresAt,
        },
      });
      await tx.authRefreshToken.create({
        data: { sessionId: created.id, tokenHash: this.tokens.hashRefreshToken(refreshToken), expiresAt },
      });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
      return created;
    });

    return this.issue(session, refreshToken, expiresAt);
  }

  /** Rotates a refresh token. Re-use of a rotated token revokes the whole session (token theft). */
  async refresh(refreshToken: string, client: ClientInfo, expectedAudience: Audience): Promise<AuthTokens> {
    const record = await this.prisma.authRefreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(refreshToken) },
      include: { session: { include: { user: { select: { status: true } } } } },
    });
    const invalid = () =>
      new AppError(401, ErrorCode.REFRESH_TOKEN_INVALID, 'Refresh token is invalid or expired');
    if (!record || record.session.audience !== expectedAudience) throw invalid();

    const session = record.session;
    const now = new Date();
    if (record.usedAt) {
      await this.handleReuse(session.id, session.userId, client);
      throw new AppError(
        401,
        ErrorCode.REFRESH_TOKEN_REUSED,
        'Refresh token was already used; please sign in again',
      );
    }
    if (session.revokedAt || session.expiresAt <= now || record.expiresAt <= now) throw invalid();
    if (session.user.status === 'suspended') {
      throw new AppError(403, ErrorCode.ACCOUNT_SUSPENDED, 'This account is suspended');
    }
    if (session.user.status === 'deleted') throw invalid();

    const next = this.tokens.generateRefreshToken();
    const expiresAt = new Date(now.getTime() + this.tokens.refreshTtlMs);
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.authRefreshToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count === 0) return null;
      await tx.authRefreshToken.create({
        data: { sessionId: session.id, tokenHash: this.tokens.hashRefreshToken(next), expiresAt },
      });
      return tx.authSession.update({
        where: { id: session.id },
        data: { lastUsedAt: now, expiresAt, ip: client.ip, userAgent: client.userAgent },
      });
    });
    if (!updated) {
      // Lost a race against another use of the same token: treat as reuse.
      await this.handleReuse(session.id, session.userId, client);
      throw new AppError(
        401,
        ErrorCode.REFRESH_TOKEN_REUSED,
        'Refresh token was already used; please sign in again',
      );
    }
    return this.issue(updated, next, expiresAt);
  }

  async revoke(sessionId: string, reason: string, tx?: Tx): Promise<void> {
    await (tx ?? this.prisma).authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: string, opts: { exceptSessionId?: string } = {}, tx?: Tx) {
    await (tx ?? this.prisma).authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(opts.exceptSessionId ? { id: { not: opts.exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  async listActive(userId: string, currentSessionId?: string): Promise<SessionView[]> {
    const sessions = await this.prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((s) => toSessionView(s, currentSessionId));
  }

  async revokeOwned(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'signed_out_by_user' },
    });
    if (result.count === 0) throw Errors.notFound('Session');
  }

  private async enforceDeviceLimit(tx: Tx, user: SessionOwner, now: Date): Promise<void> {
    const policy = await this.settings.get('auth.deviceLimit');
    const max = user.deviceLimitOverride ?? policy.maxActiveSessions;
    if (max == null) return;
    const active = await tx.authSession.findMany({
      where: { userId: user.id, audience: 'student', revokedAt: null, expiresAt: { gt: now } },
      orderBy: { lastUsedAt: 'asc' },
    });
    if (active.length < max) return;
    if (policy.onLimit === 'block') {
      throw new AppError(
        409,
        ErrorCode.DEVICE_LIMIT_REACHED,
        'You are signed in on the maximum number of devices',
        {
          maxActiveSessions: max,
          sessions: active.map((s) => {
            const { current: _current, ...view } = toSessionView(s);
            return view;
          }),
        },
      );
    }
    const excess = active.slice(0, active.length - max + 1).map((s) => s.id);
    await tx.authSession.updateMany({
      where: { id: { in: excess } },
      data: { revokedAt: now, revokeReason: 'device_limit' },
    });
  }

  private async handleReuse(sessionId: string, userId: string, client: ClientInfo): Promise<void> {
    await this.revoke(sessionId, 'refresh_token_reuse');
    await this.audit.record({
      actorUserId: userId,
      action: 'auth.refresh_token_reuse',
      entityType: 'auth_session',
      entityId: sessionId,
      client,
    });
  }

  private async issue(
    session: AuthSession,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): Promise<AuthTokens> {
    const access = await this.tokens.issueAccessToken({
      userId: session.userId,
      sessionId: session.id,
      audience: session.audience,
    });
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken,
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
      sessionId: session.id,
    };
  }
}
