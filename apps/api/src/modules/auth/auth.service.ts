import { Injectable, Logger } from '@nestjs/common';
import {
  ErrorCode,
  type AuthTokens,
  type ChangePasswordInput,
  type GoogleLoginInput,
  type LoginInput,
  type MeView,
  type RegisterInput,
  type ResetPasswordInput,
  type SendVerificationOtpInput,
  type StaffLoginInput,
  type UpdateMeInput,
  type VerifyOtpInput,
} from '@tk/contracts';
import { randomUUID } from 'node:crypto';
import type { AuthContext, ClientInfo } from '../../common/auth/auth-context.js';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { Prisma, type User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { SmsService } from '../../infra/messaging/sms.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RbacService } from '../rbac/rbac.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { GoogleVerifier } from './google-verifier.js';
import { MfaService } from './mfa.service.js';
import { OtpService } from './otp.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';

const invalidCredentials = () =>
  new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect');

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly otp: OtpService,
    private readonly sms: SmsService,
    private readonly settings: SettingsService,
    private readonly google: GoogleVerifier,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly mfa: MfaService,
  ) {}

  // ───────────── Students ─────────────

  async register(input: RegisterInput, client: ClientInfo): Promise<AuthTokens> {
    const passwordHash = await this.passwords.hash(input.password);
    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          kind: 'student',
          email: input.email,
          fullName: input.fullName,
          locale: input.locale,
          passwordHash,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw Errors.conflict(
          ErrorCode.EMAIL_ALREADY_REGISTERED,
          'An account with this email already exists',
        );
      }
      throw err;
    }
    const tokens = await this.sessions.open({ user, audience: 'student', device: input.device, client });

    const verification = await this.settings.get('auth.verification');
    if (verification.channels.email) {
      // Best effort: registration succeeds even if the email cannot be sent right now.
      await this.otp
        .send({
          purpose: 'verify_email',
          channel: 'email',
          target: input.email,
          userId: user.id,
          locale: input.locale,
        })
        .catch((err: unknown) =>
          this.logger.warn({ err, userId: user.id }, 'Could not send verification email'),
        );
    }
    return tokens;
  }

  async login(input: LoginInput, client: ClientInfo): Promise<AuthTokens> {
    const user = await this.verifyPassword(input.email, input.password, 'student');
    return this.sessions.open({
      user,
      audience: 'student',
      device: input.device,
      client,
      replaceSessionId: input.replaceSessionId,
    });
  }

  async loginWithGoogle(input: GoogleLoginInput, client: ClientInfo): Promise<AuthTokens> {
    const identity = await this.google.verify(input.idToken);
    if (!identity.emailVerified) {
      throw new AppError(401, ErrorCode.GOOGLE_TOKEN_INVALID, 'Google account email is not verified');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const linked = await tx.authIdentity.findUnique({
        where: { provider_providerSubject: { provider: 'google', providerSubject: identity.subject } },
        include: { user: true },
      });
      if (linked) return linked.user;

      const existing = await tx.user.findUnique({ where: { email: identity.email } });
      if (existing) {
        if (existing.kind !== 'student') throw invalidCredentials();
        await tx.authIdentity.create({
          data: { userId: existing.id, provider: 'google', providerSubject: identity.subject },
        });
        // Google has verified ownership of this address.
        return existing.emailVerifiedAt
          ? existing
          : tx.user.update({ where: { id: existing.id }, data: { emailVerifiedAt: new Date() } });
      }
      return tx.user.create({
        data: {
          kind: 'student',
          email: identity.email,
          emailVerifiedAt: new Date(),
          fullName: identity.name ?? identity.email.split('@')[0] ?? 'Student',
          locale: input.locale,
          identities: { create: { provider: 'google', providerSubject: identity.subject } },
        },
      });
    });

    this.assertCanSignIn(user);
    return this.sessions.open({
      user,
      audience: 'student',
      device: input.device,
      client,
      replaceSessionId: input.replaceSessionId,
    });
  }

  // ───────────── Staff ─────────────

  /** Password step. Staff with two-factor enabled get a short-lived challenge instead of a session. */
  async staffLogin(
    input: StaffLoginInput,
    client: ClientInfo,
  ): Promise<{ tokens: AuthTokens } | { mfaToken: string }> {
    const user = await this.verifyPassword(input.email, input.password, 'staff');
    if (user.mfaEnabledAt) return { mfaToken: await this.mfa.issueChallenge(user.id) };
    return { tokens: await this.openStaffSession(user, client) };
  }

  /** Second step: exchange the challenge plus an authenticator or recovery code for a session. */
  async completeStaffMfaLogin(mfaToken: string, code: string, client: ClientInfo): Promise<AuthTokens> {
    const userId = await this.mfa.verifyChallenge(mfaToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.kind !== 'staff') throw invalidCredentials();
    this.assertCanSignIn(user);
    const { usedRecoveryCode } = await this.mfa.verifyCode(user.id, code);
    if (usedRecoveryCode) {
      await this.audit.record({
        actorUserId: user.id,
        action: 'auth.mfa_recovery_code_used',
        entityType: 'user',
        entityId: user.id,
        client,
      });
    }
    return this.openStaffSession(user, client);
  }

  private openStaffSession(user: User, client: ClientInfo): Promise<AuthTokens> {
    return this.sessions.open({
      user,
      audience: 'staff',
      device: {
        deviceId: `web-${randomUUID()}`,
        deviceName: client.userAgent ?? 'Admin browser',
        platform: 'web',
      },
      client,
    });
  }

  // ───────────── Password lifecycle ─────────────

  /** Always succeeds from the caller's point of view, so it cannot be used to discover accounts. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status === 'deleted' || user.status === 'suspended' || !user.email) return;
    await this.otp
      .send({
        purpose: 'reset_password',
        channel: 'email',
        target: user.email,
        userId: user.id,
        locale: user.locale,
      })
      .catch((err: unknown) => {
        if (!(err instanceof AppError)) throw err;
      });
  }

  async resetPassword(input: ResetPasswordInput, client: ClientInfo): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.status === 'deleted')
      throw new AppError(400, ErrorCode.OTP_INVALID, 'The code is invalid');
    await this.otp.verify({ purpose: 'reset_password', target: input.email, code: input.code });

    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        // Completing the OTP proves control of the mailbox.
        data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
      });
      await this.sessions.revokeAllForUser(user.id, 'password_reset', {}, tx);
      await this.audit.record(
        {
          actorUserId: user.id,
          action: 'auth.password_reset',
          entityType: 'user',
          entityId: user.id,
          client,
        },
        tx,
      );
    });
  }

  async changePassword(auth: AuthContext, input: ChangePasswordInput, client: ClientInfo): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (user.passwordHash) {
      if (
        !input.currentPassword ||
        !(await this.passwords.verify(user.passwordHash, input.currentPassword))
      ) {
        throw invalidCredentials();
      }
    }
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await this.sessions.revokeAllForUser(
        user.id,
        'password_changed',
        { exceptSessionId: auth.sessionId },
        tx,
      );
      await this.audit.record(
        {
          actorUserId: user.id,
          action: 'auth.password_changed',
          entityType: 'user',
          entityId: user.id,
          client,
        },
        tx,
      );
    });
  }

  // ───────────── Verification (D-029) ─────────────

  async sendVerification(auth: AuthContext, input: SendVerificationOtpInput): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    const { channels } = await this.settings.get('auth.verification');

    if (input.channel === 'email') {
      if (!channels.email) throw this.channelDisabled('email');
      if (!user.email || user.emailVerifiedAt) return;
      await this.otp.send({
        purpose: 'verify_email',
        channel: 'email',
        target: user.email,
        userId: user.id,
        locale: user.locale,
      });
      return;
    }

    if (!channels.phone || !this.sms.available) throw this.channelDisabled('phone');
    if (user.phone === input.phone && user.phoneVerifiedAt) return;
    const taken = await this.prisma.user.findFirst({ where: { phone: input.phone, id: { not: user.id } } });
    if (taken)
      throw Errors.conflict(ErrorCode.PHONE_ALREADY_REGISTERED, 'This phone number is already in use');
    await this.otp.send({
      purpose: 'verify_phone',
      channel: 'phone',
      target: input.phone,
      userId: user.id,
      locale: user.locale,
    });
  }

  async verify(auth: AuthContext, input: VerifyOtpInput): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (input.channel === 'email') {
      if (!user.email) throw new AppError(400, ErrorCode.OTP_INVALID, 'The code is invalid');
      await this.otp.verify({ purpose: 'verify_email', target: user.email, code: input.code });
      await this.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      return;
    }
    const phone = await this.otp.pendingTarget(user.id, 'verify_phone');
    if (!phone) throw new AppError(400, ErrorCode.OTP_INVALID, 'The code is invalid');
    await this.otp.verify({ purpose: 'verify_phone', target: phone, code: input.code });
    try {
      await this.prisma.user.update({ where: { id: user.id }, data: { phone, phoneVerifiedAt: new Date() } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw Errors.conflict(ErrorCode.PHONE_ALREADY_REGISTERED, 'This phone number is already in use');
      }
      throw err;
    }
  }

  // ───────────── Profile ─────────────

  async me(auth: AuthContext): Promise<MeView> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      include: {
        deletionRequests: {
          where: { cancelledAt: null, completedAt: null },
          orderBy: { requestedAt: 'desc' },
          take: 1,
        },
      },
    });
    const access = user.kind === 'staff' ? await this.rbac.getAccess(user.id) : null;
    const mfaSetupRequired = access ? await this.mfa.isSetupRequired(user.id, access) : false;
    return {
      id: user.id,
      kind: user.kind,
      fullName: user.fullName,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      phone: user.phone,
      phoneVerified: Boolean(user.phoneVerifiedAt),
      hasPassword: Boolean(user.passwordHash),
      locale: user.locale,
      dob: user.dob ? user.dob.toISOString().slice(0, 10) : null,
      gender: user.gender,
      educationLevelId: user.educationLevelId,
      deletionScheduledFor: user.deletionRequests[0]?.scheduledFor.toISOString() ?? null,
      permissions: access ? [...access.permissions].sort() : [],
      mfaEnabled: Boolean(user.mfaEnabledAt),
      mfaSetupRequired,
      isSuperAdmin: access?.isSuperAdmin ?? false,
    };
  }

  async updateMe(auth: AuthContext, input: UpdateMeInput): Promise<MeView> {
    if (input.educationLevelId) {
      const level = await this.prisma.educationLevel.findFirst({
        where: { id: input.educationLevelId, active: true },
      });
      if (!level) throw Errors.validation([{ path: 'educationLevelId', message: 'Unknown education level' }]);
    }
    await this.prisma.user.update({
      where: { id: auth.userId },
      data: {
        fullName: input.fullName,
        locale: input.locale,
        dob:
          input.dob === undefined
            ? undefined
            : input.dob === null
              ? null
              : new Date(`${input.dob}T00:00:00Z`),
        gender: input.gender,
        educationLevelId: input.educationLevelId,
      },
    });
    return this.me(auth);
  }

  // ───────────── helpers ─────────────

  private async verifyPassword(email: string, password: string, kind: 'student' | 'staff'): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const usable = user && user.kind === kind && user.status !== 'deleted' ? user : null;
    const ok = await this.passwords.verify(usable?.passwordHash, password);
    if (!usable || !ok) throw invalidCredentials();
    this.assertCanSignIn(usable);
    return usable;
  }

  private assertCanSignIn(user: User): void {
    if (user.status === 'suspended')
      throw new AppError(403, ErrorCode.ACCOUNT_SUSPENDED, 'This account is suspended');
    if (user.status === 'deleted') throw invalidCredentials();
  }

  private channelDisabled(channel: string) {
    return new AppError(
      403,
      ErrorCode.VERIFICATION_CHANNEL_DISABLED,
      `Verification by ${channel} is not available`,
    );
  }
}
