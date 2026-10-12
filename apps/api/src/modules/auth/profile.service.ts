import { Injectable } from '@nestjs/common';
import { ErrorCode, type ChangeEmailInput } from '@tk/contracts';
import { randomUUID } from 'node:crypto';
import type { AuthContext, ClientInfo } from '../../common/auth/auth-context.js';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { Prisma } from '../../generated/prisma/client.js';
import { MailService } from '../../infra/messaging/mail.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MediaService } from '../media/media.service.js';
import { OtpService } from './otp.service.js';
import { PasswordService } from './password.service.js';

const invalidCredentials = () =>
  new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'The password is not correct');

/** The middle of an address is hidden in emails and logs: ra***@example.com. */
const mask = (email: string) => email.replace(/^(.{2})[^@]*/, '$1***');

/**
 * Students' own email and profile photo (D-074 / audit F-13). Phone numbers change through verification (D-029),
 * which needs an SMS provider.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly otp: OtpService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
    private readonly media: MediaService,
  ) {}

  /** Sends a code to the new address; nothing changes until it is confirmed. */
  async requestEmailChange(auth: AuthContext, input: ChangeEmailInput): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (user.passwordHash) {
      if (
        !input.currentPassword ||
        !(await this.passwords.verify(user.passwordHash, input.currentPassword))
      ) {
        throw invalidCredentials();
      }
    }
    if (user.email?.toLowerCase() === input.newEmail.toLowerCase()) {
      throw Errors.validation([{ path: 'newEmail', message: 'This is already your email' }]);
    }
    if (await this.prisma.user.findUnique({ where: { email: input.newEmail } })) {
      throw Errors.conflict(ErrorCode.EMAIL_ALREADY_REGISTERED, 'An account with this email already exists');
    }
    await this.otp.send({
      purpose: 'change_email',
      channel: 'email',
      target: input.newEmail,
      userId: user.id,
      locale: user.locale,
    });
  }

  /** The code from the new address switches the account to it (verified); the old address is told. */
  async confirmEmailChange(auth: AuthContext, code: string, client: ClientInfo): Promise<void> {
    const newEmail = await this.otp.pendingTarget(auth.userId, 'change_email');
    if (!newEmail) throw new AppError(400, ErrorCode.OTP_INVALID, 'The code is invalid');
    await this.otp.verify({ purpose: 'change_email', target: newEmail, code });
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: before.id },
          data: { email: newEmail, emailVerifiedAt: new Date() },
        });
        await this.audit.record(
          {
            actorUserId: before.id,
            action: 'account.email_changed',
            entityType: 'user',
            entityId: before.id,
            changes: { before: before.email ? mask(before.email) : null, after: mask(newEmail) },
            client,
          },
          tx,
        );
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
    if (before.email) {
      const ne = before.locale === 'ne';
      await this.mail
        .send({
          to: before.email,
          subject: ne ? 'तपाईंको इमेल परिवर्तन भयो' : 'Your email address was changed',
          text: ne
            ? `तपाईंको तयारी कक्षा खाताको इमेल ${mask(newEmail)} मा परिवर्तन गरियो। तपाईंले नगर्नुभएको हो भने तुरुन्त सहयोग टोलीलाई सम्पर्क गर्नुहोस्।`
            : `The email of your Tayari Kakshya account was changed to ${mask(newEmail)}. If this was not you, contact support straight away.`,
        })
        .catch(() => undefined);
    }
  }

  /** Replaces the profile photo; the old picture is deleted. */
  async setAvatar(userId: string, buffer: Buffer): Promise<{ avatarUrl: string }> {
    const image = await this.media.encodeAvatar(buffer);
    const key = `avatars/${userId}/${randomUUID()}.webp`;
    await this.storage.put('public', key, image, 'image/webp');
    const before = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarKey: true },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: key } });
    if (before.avatarKey) await this.storage.delete('public', before.avatarKey).catch(() => undefined);
    return { avatarUrl: this.storage.publicUrl(key) };
  }

  async removeAvatar(userId: string): Promise<void> {
    const before = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarKey: true },
    });
    if (!before.avatarKey) return;
    await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: null } });
    await this.storage.delete('public', before.avatarKey).catch(() => undefined);
  }
}
