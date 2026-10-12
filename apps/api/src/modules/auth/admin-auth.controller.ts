import { Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ErrorCode, MfaLoginInput, StaffLoginInput, type AuthTokens } from '@tk/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  Audiences,
  Client,
  CurrentAuth,
  Public,
  type AuthContext,
  type ClientInfo,
} from '../../common/auth/auth-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ApiZodBody, ZodBody } from '../../common/validation/zod.js';
import { ENV, type Env } from '../../config/env.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';

export const ADMIN_REFRESH_COOKIE = 'tk_admin_rt';
export const ADMIN_CLIENT_HEADER = 'x-tk-client';
const COOKIE_PATH = '/api/v1/admin/auth';

/**
 * Staff authentication for the Admin CMS. The refresh token lives only in an HttpOnly, SameSite=Strict cookie
 * scoped to this path; the access token is returned in the body and kept in memory by the CMS.
 * CSRF defence: cookie-bearing endpoints require the `X-TK-Client: admin` header, which cross-site forms cannot
 * send and cross-origin scripts can only send after a CORS preflight against the origin allow-list.
 */
@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @RateLimit(
    { name: 'admin.login.ip', limit: 20, windowSeconds: 900, by: ['ip'] },
    { name: 'admin.login.account', limit: 5, windowSeconds: 900, by: ['body.email'] },
  )
  @ApiZodBody(StaffLoginInput)
  async login(
    @ZodBody(StaffLoginInput) body: StaffLoginInput,
    @Client() client: ClientInfo,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.assertAdminClient(req);
    const result = await this.auth.staffLogin(body, client);
    if ('mfaToken' in result) return { mfaRequired: true, mfaToken: result.mfaToken };
    return this.respond(reply, result.tokens);
  }

  @Public()
  @Post('login/mfa')
  @HttpCode(200)
  @RateLimit(
    { name: 'admin.login.mfa', limit: 10, windowSeconds: 900, by: ['ip'] },
    // Per sign-in, so codes cannot be guessed from many addresses (each sign-in needs the password; 5 per 15 min).
    { name: 'admin.login.mfa.token', limit: 5, windowSeconds: 900, by: ['body.mfaToken'] },
  )
  @ApiZodBody(MfaLoginInput)
  async loginMfa(
    @ZodBody(MfaLoginInput) body: MfaLoginInput,
    @Client() client: ClientInfo,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.assertAdminClient(req);
    return this.respond(reply, await this.auth.completeStaffMfaLogin(body.mfaToken, body.code, client));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @RateLimit({ name: 'admin.refresh', limit: 60, windowSeconds: 60, by: ['ip'] })
  async refresh(
    @Client() client: ClientInfo,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.assertAdminClient(req);
    const token = req.cookies[ADMIN_REFRESH_COOKIE];
    if (!token) throw new AppError(401, ErrorCode.REFRESH_TOKEN_INVALID, 'Refresh token is missing');
    try {
      return this.respond(reply, await this.sessions.refresh(token, client, 'staff'));
    } catch (err) {
      this.clearCookie(reply);
      throw err;
    }
  }

  @Audiences('staff')
  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.assertAdminClient(req);
    await this.sessions.revoke(auth.sessionId, 'logout');
    this.clearCookie(reply);
  }

  private respond(reply: FastifyReply, tokens: AuthTokens) {
    void reply.setCookie(ADMIN_REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: this.env.APP_ENV === 'production' || this.env.APP_ENV === 'staging',
      sameSite: 'strict',
      path: COOKIE_PATH,
      expires: new Date(tokens.refreshTokenExpiresAt),
    });
    return {
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      sessionId: tokens.sessionId,
    };
  }

  private clearCookie(reply: FastifyReply) {
    void reply.clearCookie(ADMIN_REFRESH_COOKIE, { path: COOKIE_PATH });
  }

  private assertAdminClient(req: FastifyRequest) {
    if (req.headers[ADMIN_CLIENT_HEADER] !== 'admin') {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Missing admin client header');
    }
  }
}
