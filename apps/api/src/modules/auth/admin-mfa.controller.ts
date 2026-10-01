import { Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MfaCodeInput } from '@tk/contracts';
import {
  Audiences,
  Client,
  CurrentAuth,
  type AuthContext,
  type ClientInfo,
} from '../../common/auth/auth-context.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ApiZodBody, ZodBody } from '../../common/validation/zod.js';
import { MfaService } from './mfa.service.js';

/** A staff member's own two-factor settings. No permission needed, so it works while setup is required. */
@ApiTags('admin-mfa')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin/me/mfa')
export class AdminMfaController {
  constructor(private readonly mfa: MfaService) {}

  @Get()
  async status(@CurrentAuth() auth: AuthContext) {
    return {
      setupRequired: await this.mfa.isSetupRequired(auth.userId),
      remainingRecoveryCodes: await this.mfa.remainingRecoveryCodes(auth.userId),
    };
  }

  @Post('setup')
  @HttpCode(200)
  setup(@CurrentAuth() auth: AuthContext) {
    return this.mfa.beginSetup(auth.userId);
  }

  @Post('enable')
  @HttpCode(200)
  @RateLimit({ name: 'admin.mfa.enable', limit: 10, windowSeconds: 900, by: ['user'] })
  @ApiZodBody(MfaCodeInput)
  enable(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(MfaCodeInput) body: MfaCodeInput,
    @Client() client: ClientInfo,
  ) {
    return this.mfa.enable(auth.userId, body.code, client);
  }

  @Delete()
  @HttpCode(204)
  @RateLimit({ name: 'admin.mfa.disable', limit: 10, windowSeconds: 900, by: ['user'] })
  @ApiZodBody(MfaCodeInput)
  async disable(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(MfaCodeInput) body: MfaCodeInput,
    @Client() client: ClientInfo,
  ) {
    await this.mfa.disable(auth.userId, body.code, client);
  }
}
