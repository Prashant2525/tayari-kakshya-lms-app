import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

/** Housekeeping for short-lived auth data. Session rows are kept 90 days after they end for security review. */
@Injectable()
export class AuthCleanupService {
  constructor(private readonly prisma: PrismaService) {}

  async run(now = new Date()): Promise<{ otpCodes: number; sessions: number }> {
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);
    const otp = await this.prisma.otpCode.deleteMany({ where: { expiresAt: { lt: dayAgo } } });
    const sessions = await this.prisma.authSession.deleteMany({
      where: { OR: [{ revokedAt: { lt: ninetyDaysAgo } }, { expiresAt: { lt: ninetyDaysAgo } }] },
    });
    return { otpCodes: otp.count, sessions: sessions.count };
  }
}
