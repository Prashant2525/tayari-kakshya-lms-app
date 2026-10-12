import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ChangeEmailInput,
  ChangePasswordInput,
  ConfirmEmailChangeInput,
  ErrorCode,
  SendVerificationOtpInput,
  UpdateMeInput,
  VerifyOtpInput,
} from '@tk/contracts';
import type { FastifyRequest } from 'fastify';
import { AppError, Errors } from '../../common/errors/app-error.js';
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
import { ProfileService } from './profile.service.js';
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
    private readonly profile: ProfileService,
  ) {}

  // ───────────── Email and photo (D-074 / audit F-13; students) ─────────────

  @Audiences('student')
  @Post('email/change')
  @HttpCode(202)
  @RateLimit({ name: 'me.email.change', limit: 5, windowSeconds: 3600, by: ['user'] })
  @ApiZodBody(ChangeEmailInput)
  async changeEmail(@CurrentAuth() auth: AuthContext, @ZodBody(ChangeEmailInput) body: ChangeEmailInput) {
    await this.profile.requestEmailChange(auth, body);
    return { status: 'accepted' };
  }

  @Audiences('student')
  @Post('email/confirm')
  @HttpCode(204)
  @RateLimit({ name: 'me.email.confirm', limit: 30, windowSeconds: 3600, by: ['user'] })
  @ApiZodBody(ConfirmEmailChangeInput)
  async confirmEmail(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(ConfirmEmailChangeInput) body: ConfirmEmailChangeInput,
    @Client() client: ClientInfo,
  ) {
    await this.profile.confirmEmailChange(auth, body.code, client);
  }

  /** multipart/form-data with one `file` (JPEG, PNG or WebP). */
  @Audiences('student')
  @Put('avatar')
  @RateLimit({ name: 'me.avatar', limit: 20, windowSeconds: 3600, by: ['user'] })
  async setAvatar(@CurrentAuth() auth: AuthContext, @Req() req: FastifyRequest) {
    if (!req.isMultipart())
      throw Errors.validation([{ path: 'file', message: 'Send the picture as multipart/form-data' }]);
    const part = await req.file();
    if (!part) throw Errors.validation([{ path: 'file', message: 'No picture received' }]);
    let buffer: Buffer;
    try {
      buffer = await part.toBuffer();
    } catch {
      throw new AppError(413, ErrorCode.VALIDATION_FAILED, 'The picture is too large');
    }
    return this.profile.setAvatar(auth.userId, buffer);
  }

  @Audiences('student')
  @Delete('avatar')
  @HttpCode(204)
  async removeAvatar(@CurrentAuth() auth: AuthContext) {
    await this.profile.removeAvatar(auth.userId);
  }

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
