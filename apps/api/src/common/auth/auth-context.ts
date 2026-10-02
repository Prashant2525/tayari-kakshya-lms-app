import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@tk/contracts';
import type { FastifyRequest } from 'fastify';

export type Audience = 'student' | 'staff';

export interface AuthContext {
  userId: string;
  sessionId: string;
  audience: Audience;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export const IS_PUBLIC = 'tk:isPublic';
export const AUDIENCES = 'tk:audiences';
export const PERMISSIONS_REQUIRED = 'tk:permissions';
export const PERMISSIONS_ANY = 'tk:permissionsAny';

/** Route needs no access token (default is deny). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restricts a route/controller to tokens of the given audience(s). */
export const Audiences = (...audiences: Audience[]) => SetMetadata(AUDIENCES, audiences);

/** Staff-only route requiring at least one of the listed permissions (e.g. pickers used by several editors). */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_ANY, permissions);

/** Staff-only route requiring all listed permissions (Super Admin implicitly has all). */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_REQUIRED, permissions);

export const CurrentAuth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const auth = ctx.switchToHttp().getRequest<FastifyRequest>().auth;
  if (!auth) throw new Error('CurrentAuth used on a route without authentication');
  return auth;
});

export interface ClientInfo {
  ip: string;
  userAgent: string | null;
  requestId: string;
}

export const Client = createParamDecorator((_data: unknown, ctx: ExecutionContext): ClientInfo => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest>();
  const ua = req.headers['user-agent'];
  return {
    ip: req.ip,
    userAgent: typeof ua === 'string' ? ua.slice(0, 500) : null,
    requestId: String(req.id),
  };
});
