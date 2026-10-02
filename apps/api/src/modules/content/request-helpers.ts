import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Platform } from '@tk/contracts';
import type { FastifyRequest } from 'fastify';
import type { ContentActor } from './scope.service.js';

/**
 * The authenticated staff member with their resolved permissions (set by PermissionsGuard) and request info.
 * Only valid on routes guarded by @RequirePermissions / @RequireAnyPermission.
 */
export const StaffActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): ContentActor => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest>();
  if (!req.auth || !req.staffAccess) throw new Error('StaffActor used on a route without a permission guard');
  const ua = req.headers['user-agent'];
  return {
    userId: req.auth.userId,
    access: req.staffAccess,
    client: {
      ip: req.ip,
      userAgent: typeof ua === 'string' ? ua.slice(0, 500) : null,
      requestId: String(req.id),
    },
  };
});

/** Which client is asking (`X-TK-Platform: android | ios | web`). Defaults to web. Drives price visibility (D-027). */
export const ClientPlatform = createParamDecorator((_data: unknown, ctx: ExecutionContext): Platform => {
  const value = ctx.switchToHttp().getRequest<FastifyRequest>().headers['x-tk-platform'];
  return value === 'android' || value === 'ios' ? value : 'web';
});
