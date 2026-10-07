import { Injectable } from '@nestjs/common';
import type { LocalizedText } from '@tk/contracts';
import type { Assessment } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { EntitlementsService } from '../content/entitlements.service.js';
import { liveWhere } from '../content/publishing.js';
import { reminderMessage, resultMessage } from '../notifications/messages.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { AttemptsService } from './attempts.service.js';

const RESULTS_PER_RUN = 500;
const TESTS_PER_RUN = 100;

/**
 * Exam notifications (D-060), sent by the worker: a student's result once it is out (unless they already opened it),
 * and reminders before a scheduled test opens to the students who can take it.
 */
@Injectable()
export class ExamNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly attempts: AttemptsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * Completed attempts whose results are now out under their test's release rule (at once, when it closes, or when
   * staff release them — written answers count once graded), and which the student has not opened yet.
   */
  async notifyResults(now = new Date()): Promise<number> {
    const due = await this.prisma.$queryRaw<
      Array<{ id: string; user_id: string; assessment_id: string; deleted: boolean }>
    >`
      SELECT t.id, t.user_id, t.assessment_id, a.deleted_at IS NOT NULL AS deleted
      FROM attempts t JOIN assessments a ON a.id = t.assessment_id
      WHERE t.status = 'completed' AND t.result_notified_at IS NULL AND NOT t.practice
        AND (a.result_release = 'immediate'
          OR (a.result_release = 'after_close' AND a.closes_at <= ${now})
          OR (a.result_release = 'manual' AND a.results_released_at <= ${now}))
      ORDER BY t.submitted_at
      LIMIT ${RESULTS_PER_RUN}`;
    if (!due.length) return 0;
    const tests = await this.prisma.assessment.findMany({
      where: { id: { in: [...new Set(due.map((d) => d.assessment_id))] } },
      select: { id: true, title: true },
    });
    const titles = new Map(tests.map((t) => [t.id, t.title as LocalizedText]));
    let sent = 0;
    for (const row of due) {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.attempt.updateMany({
          where: { id: row.id, resultNotifiedAt: null },
          data: { resultNotifiedAt: now },
        });
        // A deleted test's results are not announced; the attempt just leaves the queue.
        if (!claimed.count || row.deleted) return;
        await this.notifications.notify(
          [row.user_id],
          resultMessage(row.id, titles.get(row.assessment_id) ?? { en: '' }),
          tx,
        );
        sent += 1;
      });
    }
    return sent;
  }

  /**
   * Reminders before live, scheduled tests open (`notifications.examReminders`). Each reminder time goes once per
   * test and opening time; when several are due together (a test scheduled at short notice, or the worker was down),
   * only the nearest is sent and the others are recorded as skipped.
   */
  async sendReminders(now = new Date()): Promise<number> {
    const { enabled, minutesBefore } = await this.settings.get('notifications.examReminders');
    if (!enabled || !minutesBefore.length) return 0;
    const horizon = new Date(now.getTime() + Math.max(...minutesBefore) * 60_000);
    const tests = await this.prisma.assessment.findMany({
      where: {
        ...liveWhere(now),
        type: { not: 'daily_challenge' },
        opensAt: { gt: now, lte: horizon },
      },
      orderBy: { opensAt: 'asc' },
      take: TESTS_PER_RUN,
    });
    let sent = 0;
    for (const test of tests) {
      const opensAt = test.opensAt as Date;
      const due = minutesBefore
        .filter((m) => now.getTime() >= opensAt.getTime() - m * 60_000)
        .sort((a, b) => a - b);
      const [nearest] = due;
      if (nearest === undefined) continue;
      const done = await this.prisma.assessmentReminder.findMany({
        where: { assessmentId: test.id, opensAt, minutesBefore: { in: due } },
        select: { minutesBefore: true },
      });
      const handled = new Set(done.map((d) => d.minutesBefore));
      if (due.every((m) => handled.has(m))) continue;
      sent += await this.prisma.$transaction(
        async (tx) => {
          const skipped = due.filter((m) => m !== nearest && !handled.has(m));
          if (skipped.length) {
            await tx.assessmentReminder.createMany({
              data: skipped.map((m) => ({ assessmentId: test.id, minutesBefore: m, opensAt, sent: false })),
              skipDuplicates: true,
            });
          }
          if (handled.has(nearest)) return 0;
          const claimed = await tx.assessmentReminder.createMany({
            data: [{ assessmentId: test.id, minutesBefore: nearest, opensAt, sent: true }],
            skipDuplicates: true,
          });
          if (!claimed.count) return 0;
          const recipients = await this.recipients(test, now);
          await this.notifications.notify(
            recipients,
            reminderMessage({ id: test.id, title: test.title as LocalizedText, opensAt }, nearest, now),
            tx,
          );
          await tx.assessmentReminder.update({
            where: {
              assessmentId_minutesBefore_opensAt: { assessmentId: test.id, minutesBefore: nearest, opensAt },
            },
            data: { recipients: recipients.length },
          });
          return 1;
        },
        { timeout: 120_000 },
      );
    }
    return sent;
  }

  /**
   * Who is reminded: the students the test is listed for — a course's students, the students of courses with the
   * subject, or the students preparing for the exam (or one below it) — who may take it (D-048 access rules). A test
   * linked to none of these is not listed for anyone, so no one is reminded.
   */
  async recipients(test: Assessment, now = new Date()): Promise<string[]> {
    let candidates: string[];
    if (test.courseId) {
      candidates = await this.entitlements.studentIdsWithCourses([test.courseId], now);
    } else if (test.subjectId) {
      const courses = await this.prisma.courseSubject.findMany({
        where: { subjectId: test.subjectId, course: { deletedAt: null } },
        select: { courseId: true },
      });
      candidates = await this.entitlements.studentIdsWithCourses(
        courses.map((c) => c.courseId),
        now,
      );
    } else if (test.examNodeId) {
      const nodes = await this.attempts.withDescendants([test.examNodeId]);
      const targets = await this.prisma.userTargetPost.findMany({
        where: { examNodeId: { in: [...nodes] }, user: { kind: 'student', status: 'active' } },
        select: { userId: true },
        distinct: ['userId'],
      });
      candidates = targets.map((t) => t.userId);
    } else {
      return [];
    }
    if (test.accessLevel === 'free') return candidates;
    const allowed: string[] = [];
    for (const userId of candidates) {
      if (await this.attempts.canTakeAs(test, userId)) allowed.push(userId);
    }
    return allowed;
  }
}
