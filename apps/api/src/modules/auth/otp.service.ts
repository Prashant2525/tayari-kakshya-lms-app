import { Injectable } from '@nestjs/common';
import { ErrorCode, OTP_POLICY } from '@tk/contracts';
import { randomInt } from 'node:crypto';
import { AppError, Errors } from '../../common/errors/app-error.js';
import type { OtpChannel, OtpPurpose } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { MailService } from '../../infra/messaging/mail.service.js';
import { SmsService } from '../../infra/messaging/sms.service.js';
import { TokenService } from './token.service.js';
import { otpMessage } from './otp-messages.js';
import { BuyingGuideService } from '../notifications/buying-guide.service.js';

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
    private readonly guide: BuyingGuideService,
  ) {}

  async send(params: {
    purpose: OtpPurpose;
    channel: OtpChannel;
    target: string;
    userId: string | null;
    locale: 'en' | 'ne';
  }): Promise<void> {
    const { purpose, channel, target, userId, locale } = params;
    const now = Date.now();
    const recent = await this.prisma.otpCode.findMany({
      where: { target, purpose, createdAt: { gt: new Date(now - 3_600_000) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const last = recent[0];
    if (last) {
      const elapsed = Math.floor((now - last.createdAt.getTime()) / 1000);
      if (elapsed < OTP_POLICY.resendCooldownSeconds) {
        const retryAfterSeconds = OTP_POLICY.resendCooldownSeconds - elapsed;
        throw new AppError(429, ErrorCode.OTP_RESEND_TOO_SOON, 'Please wait before requesting another code', {
          retryAfterSeconds,
        });
      }
    }
    if (recent.length >= OTP_POLICY.maxPerHour) throw Errors.rateLimited(3600);

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.$transaction([
      // Only the newest code is valid.
      this.prisma.otpCode.updateMany({
        where: { target, purpose, consumedAt: null },
        data: { consumedAt: new Date(now) },
      }),
      this.prisma.otpCode.create({
        data: {
          userId,
          purpose,
          channel,
          target,
          codeHash: this.tokens.hashOtp(purpose, target, code),
          expiresAt: new Date(now + OTP_POLICY.ttlMinutes * 60_000),
        },
      }),
    ]);

    const message = otpMessage(purpose, locale, code, OTP_POLICY.ttlMinutes);
    if (channel === 'email') {
      // D-061: the sign-up verification email also says how to get courses; other codes stay short (security).
      const body =
        purpose === 'verify_email' ? await this.guide.compose(message.text, locale) : { text: message.text };
      await this.mail.send({ to: target, subject: message.subject, ...body });
    } else await this.sms.send({ to: target, text: message.text });
  }

  /** Consumes the newest valid code or throws OTP_INVALID / OTP_EXPIRED / OTP_TOO_MANY_ATTEMPTS. */
  async verify(params: {
    purpose: OtpPurpose;
    target: string;
    code: string;
  }): Promise<{ userId: string | null }> {
    const { purpose, target, code } = params;
    const record = await this.prisma.otpCode.findFirst({
      where: { target, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new AppError(400, ErrorCode.OTP_INVALID, 'The code is invalid');
    if (record.expiresAt <= new Date())
      throw new AppError(400, ErrorCode.OTP_EXPIRED, 'The code has expired');
    if (record.attempts >= OTP_POLICY.maxAttempts) {
      throw new AppError(
        429,
        ErrorCode.OTP_TOO_MANY_ATTEMPTS,
        'Too many incorrect attempts; request a new code',
      );
    }
    if (!TokenService.safeEqual(record.codeHash, this.tokens.hashOtp(purpose, target, code))) {
      const updated = await this.prisma.otpCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      if (updated.attempts >= OTP_POLICY.maxAttempts) {
        throw new AppError(
          429,
          ErrorCode.OTP_TOO_MANY_ATTEMPTS,
          'Too many incorrect attempts; request a new code',
        );
      }
      throw new AppError(400, ErrorCode.OTP_INVALID, 'The code is invalid');
    }
    const consumed = await this.prisma.otpCode.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) throw new AppError(400, ErrorCode.OTP_INVALID, 'The code is invalid');
    return { userId: record.userId };
  }

  /** Most recent pending (unconsumed, unexpired) target for a user — used to know which phone is being verified. */
  async pendingTarget(userId: string, purpose: OtpPurpose): Promise<string | null> {
    const record = await this.prisma.otpCode.findFirst({
      where: { userId, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { target: true },
    });
    return record?.target ?? null;
  }
}
