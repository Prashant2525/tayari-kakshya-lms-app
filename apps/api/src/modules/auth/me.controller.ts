import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ChangePasswordInput, SendVerificationOtpInput, UpdateMeInput, VerifyOtpInput } from '@tk/contracts';
import {
  Audiences,
  Client,
  CurrentAuth,
  type AuthContext,
  type ClientInfo,
} from '../../common/auth/auth-context.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ApiZodBody, ZodBody } from '../../common/validation/zod.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';

/** The signed-in user's own account. Available to students and staff unless noted. */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly deletion: AccountDeletionService,
  ) {}

  @Get()
  me(@CurrentAuth() auth: AuthContext) {
    return this.auth.me(auth);
  }

  @Patch()
  @ApiZodBody(UpdateMeInput)
  update(@CurrentAuth() auth: AuthContext, @ZodBody(UpdateMeInput) body: UpdateMeInput) {
    return this.auth.updateMe(auth, body);
  }

  @Get('sessions')
  sessionsList(@CurrentAuth() auth: AuthContext) {
    return this.sessions.listActive(auth.userId, auth.sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(@CurrentAuth() auth: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.sessions.revokeOwned(auth.userId, id);
  }

  @Post('password')
  @HttpCode(204)
  @RateLimit({ name: 'me.password', limit: 10, windowSeconds: 900, by: ['user'] })
  @ApiZodBody(ChangePasswordInput)
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(ChangePasswordInput) body: ChangePasswordInput,
    @Client() client: ClientInfo,
  ) {
    await this.auth.changePassword(auth, body, client);
  }

  @Audiences('student')
  @Post('verification/send')
  @HttpCode(202)
  @RateLimit({ name: 'me.verification.send', limit: 10, windowSeconds: 3600, by: ['user'] })
  @ApiZodBody(SendVerificationOtpInput)
  async sendVerification(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(SendVerificationOtpInput) body: SendVerificationOtpInput,
  ) {
    await this.auth.sendVerification(auth, body);
    return { status: 'accepted' };
  }

  @Audiences('student')
  @Post('verification/verify')
  @HttpCode(204)
  @RateLimit({ name: 'me.verification.verify', limit: 30, windowSeconds: 3600, by: ['user'] })
  @ApiZodBody(VerifyOtpInput)
  async verify(@CurrentAuth() auth: AuthContext, @ZodBody(VerifyOtpInput) body: VerifyOtpInput) {
    await this.auth.verify(auth, body);
  }

  @Audiences('student')
  @Post('deletion')
  @HttpCode(202)
  requestDeletion(@CurrentAuth() auth: AuthContext, @Client() client: ClientInfo) {
    return this.deletion.request(auth, client);
  }

  @Audiences('student')
  @Delete('deletion')
  @HttpCode(204)
  async cancelDeletion(@CurrentAuth() auth: AuthContext, @Client() client: ClientInfo) {
    await this.deletion.cancel(auth, client);
  }
}
