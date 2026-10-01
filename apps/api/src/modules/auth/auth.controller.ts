import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ForgotPasswordInput,
  GoogleLoginInput,
  LoginInput,
  RefreshInput,
  RegisterInput,
  ResetPasswordInput,
} from '@tk/contracts';
import {
  Audiences,
  Client,
  CurrentAuth,
  Public,
  type AuthContext,
  type ClientInfo,
} from '../../common/auth/auth-context.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ApiZodBody, ZodBody } from '../../common/validation/zod.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Post('register')
  @RateLimit({ name: 'auth.register', limit: 10, windowSeconds: 3600, by: ['ip'] })
  @ApiZodBody(RegisterInput)
  register(@ZodBody(RegisterInput) body: RegisterInput, @Client() client: ClientInfo) {
    return this.auth.register(body, client);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @RateLimit(
    { name: 'auth.login.ip', limit: 30, windowSeconds: 900, by: ['ip'] },
    { name: 'auth.login.account', limit: 10, windowSeconds: 900, by: ['body.email'] },
  )
  @ApiZodBody(LoginInput)
  login(@ZodBody(LoginInput) body: LoginInput, @Client() client: ClientInfo) {
    return this.auth.login(body, client);
  }

  @Public()
  @Post('google')
  @HttpCode(200)
  @RateLimit({ name: 'auth.google', limit: 30, windowSeconds: 900, by: ['ip'] })
  @ApiZodBody(GoogleLoginInput)
  google(@ZodBody(GoogleLoginInput) body: GoogleLoginInput, @Client() client: ClientInfo) {
    return this.auth.loginWithGoogle(body, client);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @RateLimit({ name: 'auth.refresh', limit: 60, windowSeconds: 60, by: ['ip'] })
  @ApiZodBody(RefreshInput)
  refresh(@ZodBody(RefreshInput) body: RefreshInput, @Client() client: ClientInfo) {
    return this.sessions.refresh(body.refreshToken, client, 'student');
  }

  @Audiences('student')
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentAuth() auth: AuthContext) {
    await this.sessions.revoke(auth.sessionId, 'logout');
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(202)
  @RateLimit(
    { name: 'auth.forgot.ip', limit: 10, windowSeconds: 3600, by: ['ip'] },
    { name: 'auth.forgot.account', limit: 5, windowSeconds: 3600, by: ['body.email'] },
  )
  @ApiZodBody(ForgotPasswordInput)
  async forgot(@ZodBody(ForgotPasswordInput) body: ForgotPasswordInput) {
    await this.auth.forgotPassword(body.email);
    return { status: 'accepted' };
  }

  @Public()
  @Post('password/reset')
  @HttpCode(204)
  @RateLimit({ name: 'auth.reset', limit: 20, windowSeconds: 3600, by: ['ip'] })
  @ApiZodBody(ResetPasswordInput)
  async reset(@ZodBody(ResetPasswordInput) body: ResetPasswordInput, @Client() client: ClientInfo) {
    await this.auth.resetPassword(body, client);
  }
}
