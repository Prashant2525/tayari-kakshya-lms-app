import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, type Permission } from '@tk/contracts';
import type { FastifyRequest } from 'fastify';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { TokenService } from '../../modules/auth/token.service.js';
import { MfaService } from '../../modules/auth/mfa.service.js';
import { RbacService, type StaffAccess } from '../../modules/rbac/rbac.service.js';
import { SettingsService } from '../../modules/settings/settings.service.js';
import { AppError, Errors } from '../errors/app-error.js';
import {
  AUDIENCES,
  IS_PUBLIC,
  PERMISSIONS_ANY,
  PERMISSIONS_REQUIRED,
  type Audience,
} from './auth-context.js';

declare module 'fastify' {
  interface FastifyRequest {
    staffAccess?: StaffAccess;
  }
}

/**
 * Default-deny authentication. Verifies the JWT, then the session and user in the database so that
 * sign-out, password reset, suspension and refresh-token theft take effect immediately.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw Errors.unauthenticated();
    const claims = await this.tokens.verifyAccessToken(header.slice('Bearer '.length).trim());

    const session = await this.prisma.authSession.findUnique({
      where: { id: claims.sessionId },
      select: {
        userId: true,
        audience: true,
        revokedAt: true,
        expiresAt: true,
        user: { select: { status: true, kind: true } },
      },
    });
    if (
      !session ||
      session.userId !== claims.userId ||
      session.audience !== claims.audience ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw Errors.unauthenticated('Session is no longer valid');
    }
    if (session.user.status === 'suspended') {
      throw new AppError(403, ErrorCode.ACCOUNT_SUSPENDED, 'This account is suspended');
    }
    if (session.user.status === 'deleted') throw Errors.unauthenticated('Session is no longer valid');

    const allowed = this.reflector.getAllAndOverride<Audience[]>(AUDIENCES, targets);
    if (allowed && !allowed.includes(claims.audience)) throw Errors.forbidden();

    req.auth = { userId: claims.userId, sessionId: claims.sessionId, audience: claims.audience };
    return true;
  }
}

/** Enforces `@RequirePermissions(...)`; only staff tokens can satisfy it. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
    private readonly mfa: MfaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_REQUIRED, [
      context.getHandler(),
      context.getClass(),
    ]);
    const any = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_ANY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if ((!required || required.length === 0) && (!any || any.length === 0)) return true;
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (!req.auth || req.auth.audience !== 'staff') throw Errors.forbidden();
    const access = await this.rbac.getAccess(req.auth.userId);
    if (!access.isSuperAdmin) {
      if (required?.length && !required.every((p) => access.permissions.has(p))) throw Errors.forbidden();
      if (any?.length && !any.some((p) => access.permissions.has(p))) throw Errors.forbidden();
    }
    if (await this.mfa.isSetupRequired(req.auth.userId, access)) {
      throw new AppError(403, ErrorCode.MFA_SETUP_REQUIRED, 'Set up two-factor authentication to continue');
    }
    req.staffAccess = access;
    return true;
  }
}

const ALWAYS_AVAILABLE = [/^\/api\/v1\/admin(\/|$)/, /^\/api\/v1\/health(\/|$)/, /^\/api\/v1\/app\/config$/];

/** Maintenance mode (S24): blocks student-facing routes; admin, health and app config stay available. */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(private readonly settings: SettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const path = req.url.split('?')[0] ?? '';
    if (ALWAYS_AVAILABLE.some((re) => re.test(path))) return true;
    const maintenance = await this.settings.get('app.maintenance');
    if (maintenance.enabled) {
      throw new AppError(503, ErrorCode.MAINTENANCE_MODE, 'The service is under maintenance', {
        message: maintenance.message,
      });
    }
    return true;
  }
}
