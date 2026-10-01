import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '@tk/contracts';
import { errors as joseErrors, jwtVerify, SignJWT } from 'jose';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Audience } from '../../common/auth/auth-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { ENV, type Env } from '../../config/env.js';

const ISSUER = 'tayari-kakshya-api';

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
  audience: Audience;
}

/** Short-lived JWT access tokens + opaque refresh tokens (stored only as HMAC hashes). */
@Injectable()
export class TokenService {
  private readonly accessKey: Uint8Array;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  }

  get accessTtlSeconds(): number {
    return this.env.JWT_ACCESS_TTL_SECONDS;
  }

  get refreshTtlMs(): number {
    return this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000;
  }

  async issueAccessToken(
    claims: AccessTokenClaims,
    now = new Date(),
  ): Promise<{ token: string; expiresAt: Date }> {
    const iat = Math.floor(now.getTime() / 1000);
    const exp = iat + this.env.JWT_ACCESS_TTL_SECONDS;
    const token = await new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(ISSUER)
      .setAudience(claims.audience)
      .setSubject(claims.userId)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(this.accessKey);
    return { token, expiresAt: new Date(exp * 1000) };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.accessKey, {
        issuer: ISSUER,
        audience: ['student', 'staff'],
        algorithms: ['HS256'],
      });
      const audience = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
      if (typeof payload.sub !== 'string' || typeof payload['sid'] !== 'string') throw new Error('malformed');
      if (audience !== 'student' && audience !== 'staff') throw new Error('bad audience');
      return { userId: payload.sub, sessionId: payload['sid'], audience };
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) {
        throw new AppError(401, ErrorCode.TOKEN_EXPIRED, 'Access token expired');
      }
      throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Invalid access token');
    }
  }

  generateRefreshToken(): string {
    return `rt_${randomBytes(32).toString('base64url')}`;
  }

  hashRefreshToken(token: string): string {
    return createHmac('sha256', this.env.REFRESH_TOKEN_PEPPER).update(token).digest('base64url');
  }

  hashOtp(purpose: string, target: string, code: string): string {
    return createHmac('sha256', this.env.OTP_PEPPER)
      .update(`${purpose}:${target}:${code}`)
      .digest('base64url');
  }

  /** Short-lived proof that a staff member passed the password step; only exchangeable at the MFA step. */
  async issueMfaChallenge(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(ISSUER)
      .setAudience('mfa')
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(this.accessKey);
  }

  async verifyMfaChallenge(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, this.accessKey, {
        issuer: ISSUER,
        audience: 'mfa',
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string') throw new Error('malformed');
      return payload.sub;
    } catch {
      throw new AppError(401, ErrorCode.MFA_INVALID, 'The sign-in attempt expired; please start again');
    }
  }

  /** Key for hashing MFA recovery codes. */
  get recoveryCodeKey(): string {
    return this.env.OTP_PEPPER;
  }

  static safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  }
}
