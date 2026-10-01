import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { RedisService } from '../../infra/redis/redis.provider.js';
import { Errors } from '../errors/app-error.js';

export interface RateLimitPolicy {
  /** Bucket name, e.g. `auth.login`. */
  name: string;
  limit: number;
  windowSeconds: number;
  /** What identifies the caller: IP and/or a body field (e.g. email), and/or the authenticated user. */
  by: Array<'ip' | 'user' | `body.${string}`>;
}

const RATE_LIMITS = 'tk:rateLimits';
/** Applied to every route without its own policy. */
const DEFAULT_POLICY: RateLimitPolicy = { name: 'default', limit: 300, windowSeconds: 60, by: ['ip'] };

/** Adds one or more rate-limit policies to a route (all must pass). */
export const RateLimit = (...policies: RateLimitPolicy[]) => SetMetadata(RATE_LIMITS, policies);

/** Fixed-window limiter in Redis (shared by all API instances). */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const policies =
      this.reflector.getAllAndOverride<RateLimitPolicy[]>(RATE_LIMITS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    for (const policy of [DEFAULT_POLICY, ...policies]) {
      const identity = this.identity(policy, req);
      if (identity === null) continue;
      const window = Math.floor(Date.now() / 1000 / policy.windowSeconds);
      const key = `rl:${policy.name}:${window}:${identity}`;
      const count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, policy.windowSeconds + 1);
      if (count > policy.limit) {
        const retryAfter = policy.windowSeconds - (Math.floor(Date.now() / 1000) % policy.windowSeconds);
        throw Errors.rateLimited(Math.max(retryAfter, 1));
      }
    }
    return true;
  }

  private identity(policy: RateLimitPolicy, req: FastifyRequest): string | null {
    const parts: string[] = [];
    for (const source of policy.by) {
      if (source === 'ip') parts.push(req.ip);
      else if (source === 'user') parts.push(req.auth?.userId ?? req.ip);
      else {
        const field = source.slice('body.'.length);
        const value = (req.body as Record<string, unknown> | undefined)?.[field];
        if (typeof value !== 'string' || !value) return null;
        parts.push(value.trim().toLowerCase());
      }
    }
    // Hash so raw emails never appear as Redis keys.
    return createHash('sha256').update(parts.join('|')).digest('base64url').slice(0, 32);
  }
}
