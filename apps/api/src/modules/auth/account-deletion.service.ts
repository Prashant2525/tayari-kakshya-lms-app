import { Injectable } from '@nestjs/common';
import type { AuthContext, ClientInfo } from '../../common/auth/auth-context.js';
import { Errors } from '../../common/errors/app-error.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { SessionService } from './session.service.js';

/**
 * Self-service account deletion (D-032): request → grace period (setting) → erasure of personal data.
 * Financial records (Phase 11) keep the user id but no personal data remains on the user row.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async request(auth: AuthContext, client: ClientInfo): Promise<{ scheduledFor: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (user.kind !== 'student') throw Errors.forbidden('Staff accounts are managed by an administrator');
    const existing = await this.prisma.accountDeletionRequest.findFirst({
      where: { userId: user.id, cancelledAt: null, completedAt: null },
    });
    if (existing) return { scheduledFor: existing.scheduledFor.toISOString() };

    const { days } = await this.settings.get('account.deletionGraceDays');
    const scheduledFor = new Date(Date.now() + days * 86_400_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.accountDeletionRequest.create({ data: { userId: user.id, scheduledFor } });
      await tx.user.update({ where: { id: user.id }, data: { status: 'pending_deletion' } });
      await this.sessions.revokeAllForUser(
        user.id,
        'deletion_requested',
        { exceptSessionId: auth.sessionId },
        tx,
      );
      await this.audit.record(
        {
          actorUserId: user.id,
          action: 'account.deletion_requested',
          entityType: 'user',
          entityId: user.id,
          client,
        },
        tx,
      );
    });
    return { scheduledFor: scheduledFor.toISOString() };
  }

  async cancel(auth: AuthContext, client: ClientInfo): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const pending = await tx.accountDeletionRequest.updateMany({
        where: { userId: auth.userId, cancelledAt: null, completedAt: null },
        data: { cancelledAt: new Date() },
      });
      if (pending.count === 0) throw Errors.notFound('Pending deletion request');
      await tx.user.update({ where: { id: auth.userId }, data: { status: 'active' } });
      await this.audit.record(
        {
          actorUserId: auth.userId,
          action: 'account.deletion_cancelled',
          entityType: 'user',
          entityId: auth.userId,
          client,
        },
        tx,
      );
    });
  }

  /** Erases accounts whose grace period has ended. Run by the worker; safe to run repeatedly. */
  async processDue(now = new Date()): Promise<number> {
    const due = await this.prisma.accountDeletionRequest.findMany({
      where: { scheduledFor: { lte: now }, cancelledAt: null, completedAt: null },
      select: { id: true, userId: true },
      take: 100,
    });
    for (const request of due) {
      await this.prisma.$transaction(async (tx) => {
        await tx.authIdentity.deleteMany({ where: { userId: request.userId } });
        await tx.authSession.deleteMany({ where: { userId: request.userId } });
        await tx.otpCode.deleteMany({ where: { userId: request.userId } });
        await tx.userTargetPost.deleteMany({ where: { userId: request.userId } });
        await tx.bookmark.deleteMany({ where: { userId: request.userId } });
        // Answers go with their attempts (cascade).
        await tx.attempt.deleteMany({ where: { userId: request.userId } });
        await tx.userStreak.deleteMany({ where: { userId: request.userId } });
        await tx.certificate.deleteMany({ where: { userId: request.userId } });
        await tx.mistake.deleteMany({ where: { userId: request.userId } });
        await tx.practiceAnswer.deleteMany({ where: { userId: request.userId } });
        await tx.studyTime.deleteMany({ where: { userId: request.userId } });
        await tx.studyClock.deleteMany({ where: { userId: request.userId } });
        await tx.studyPlan.deleteMany({ where: { userId: request.userId } });
        await tx.courseReview.deleteMany({ where: { userId: request.userId } });
        await tx.learningProgress.deleteMany({ where: { userId: request.userId } });
        await tx.liveAttendance.deleteMany({ where: { userId: request.userId } });
        // Question reports stay for the content team, without the student's own words.
        await tx.questionReport.updateMany({ where: { userId: request.userId }, data: { message: null } });
        // Discussions: their posts are emptied (kept as "deleted" so others' replies keep their place).
        await tx.discussionPost.updateMany({
          where: { userId: request.userId },
          data: {
            status: 'deleted',
            body: '',
            isBest: false,
            hiddenReason: null,
            hiddenById: null,
            hiddenAt: null,
          },
        });
        await tx.discussionReport.deleteMany({ where: { userId: request.userId } });
        await tx.discussionBan.deleteMany({ where: { userId: request.userId } });
        // Notifications (D-033) and Apple-device course interest / account emails (D-061).
        await tx.pushToken.deleteMany({ where: { userId: request.userId } });
        await tx.notificationDelivery.deleteMany({ where: { userId: request.userId } });
        await tx.notification.deleteMany({ where: { userId: request.userId } });
        await tx.notificationPreference.deleteMany({ where: { userId: request.userId } });
        await tx.courseInterest.deleteMany({ where: { userId: request.userId } });
        await tx.accountEmail.deleteMany({ where: { userId: request.userId } });
        await tx.user.update({
          where: { id: request.userId },
          data: {
            status: 'deleted',
            email: null,
            emailVerifiedAt: null,
            phone: null,
            phoneVerifiedAt: null,
            passwordHash: null,
            fullName: 'Deleted user',
            dob: null,
            gender: null,
            educationLevelId: null,
          },
        });
        await tx.accountDeletionRequest.update({ where: { id: request.id }, data: { completedAt: now } });
        await this.audit.record(
          { actorUserId: null, action: 'account.erased', entityType: 'user', entityId: request.userId },
          tx,
        );
      });
    }
    return due.length;
  }
}
