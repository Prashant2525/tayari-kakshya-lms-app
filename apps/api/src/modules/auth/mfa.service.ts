import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@tk/contracts';
import { createHmac, randomBytes } from 'node:crypto';
import type { ClientInfo } from '../../common/auth/auth-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { FieldEncryption } from '../../common/security/field-encryption.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RbacService, type StaffAccess } from '../rbac/rbac.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp.js';
import { TokenService } from './token.service.js';

const ISSUER = 'Tayari Kakshya';
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

const invalidCode = () => new AppError(401, ErrorCode.MFA_INVALID, 'The authentication code is invalid');

function randomRecoveryCode(): string {
  const bytes = randomBytes(8);
  const chars = [...bytes].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

/** Staff two-factor authentication: TOTP authenticator apps + single-use recovery codes. */
@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldEncryption,
    private readonly tokens: TokenService,
    private readonly settings: SettingsService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
  ) {}

  /** Whether policy requires this staff member to enrol before using permission-protected endpoints. */
  async isSetupRequired(userId: string, access?: StaffAccess): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { kind: true, mfaEnabledAt: true },
    });
    if (!user || user.kind !== 'staff' || user.mfaEnabledAt) return false;
    const { requiredFor } = await this.settings.get('auth.staffMfa');
    if (requiredFor === 'all_staff') return true;
    if (requiredFor === 'super_admins') return (access ?? (await this.rbac.getAccess(userId))).isSuperAdmin;
    return false;
  }

  async beginSetup(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabledAt)
      throw new AppError(409, ErrorCode.MFA_ALREADY_ENABLED, 'Two-factor is already enabled');
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecretEnc: this.crypto.encrypt(secret), mfaLastUsedStep: null },
    });
    return { secret, otpauthUrl: otpauthUrl({ secret, account: user.email ?? user.id, issuer: ISSUER }) };
  }

  async enable(userId: string, code: string, client: ClientInfo): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabledAt)
      throw new AppError(409, ErrorCode.MFA_ALREADY_ENABLED, 'Two-factor is already enabled');
    if (!user.mfaSecretEnc)
      throw new AppError(400, ErrorCode.MFA_NOT_ENABLED, 'Start two-factor setup first');
    const step = verifyTotp(this.crypto.decrypt(user.mfaSecretEnc), code, Date.now());
    if (step === null) throw invalidCode();

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, randomRecoveryCode);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { mfaEnabledAt: new Date(), mfaLastUsedStep: step },
      });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((c) => ({ userId, codeHash: this.hashRecoveryCode(c) })),
      });
      await this.audit.record(
        { actorUserId: userId, action: 'auth.mfa_enabled', entityType: 'user', entityId: userId, client },
        tx,
      );
    });
    return { recoveryCodes };
  }

  async disable(userId: string, code: string, client: ClientInfo): Promise<void> {
    await this.verifyCode(userId, code);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { mfaEnabledAt: null, mfaSecretEnc: null, mfaLastUsedStep: null },
      });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await this.audit.record(
        { actorUserId: userId, action: 'auth.mfa_disabled', entityType: 'user', entityId: userId, client },
        tx,
      );
    });
  }

  /** Accepts a current TOTP code (each time step only once) or an unused recovery code. */
  async verifyCode(userId: string, code: string): Promise<{ usedRecoveryCode: boolean }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaEnabledAt || !user.mfaSecretEnc) {
      throw new AppError(400, ErrorCode.MFA_NOT_ENABLED, 'Two-factor is not enabled');
    }
    const normalized = code.trim().toLowerCase();
    if (/^\d{6}$/.test(normalized)) {
      const step = verifyTotp(this.crypto.decrypt(user.mfaSecretEnc), normalized, Date.now());
      if (step === null) throw invalidCode();
      // Atomic replay protection: only advance if this step is newer than the last accepted one.
      const advanced = await this.prisma.user.updateMany({
        where: { id: userId, OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }] },
        data: { mfaLastUsedStep: step },
      });
      if (advanced.count === 0) throw invalidCode();
      return { usedRecoveryCode: false };
    }
    const used = await this.prisma.mfaRecoveryCode.updateMany({
      where: { userId, codeHash: this.hashRecoveryCode(normalized), usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count === 0) throw invalidCode();
    return { usedRecoveryCode: true };
  }

  async remainingRecoveryCodes(userId: string): Promise<number> {
    return this.prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } });
  }

  issueChallenge(userId: string): Promise<string> {
    return this.tokens.issueMfaChallenge(userId);
  }

  verifyChallenge(token: string): Promise<string> {
    return this.tokens.verifyMfaChallenge(token);
  }

  private hashRecoveryCode(code: string): string {
    return createHmac('sha256', this.tokens.recoveryCodeKey).update(code.toLowerCase()).digest('base64url');
  }
}
