import { Logger, type INestApplicationContext } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { reportError } from '../infra/monitoring/sentry.js';
import { AttemptsService } from '../modules/attempts/attempts.service.js';
import { AccountDeletionService } from '../modules/auth/account-deletion.service.js';
import { AuthCleanupService } from '../modules/auth/auth-cleanup.service.js';
import { PaymentsService } from '../modules/payments/payments.service.js';
import { ReceiptsService } from '../modules/payments/receipts.service.js';
import { NoticesService } from '../modules/notices/notices.service.js';
import { NotificationsService } from '../modules/notifications/notifications.service.js';
import { ExamNotificationsService } from '../modules/attempts/exam-notifications.service.js';
import { AccountEmailsService } from '../modules/notifications/account-emails.service.js';
import { ArticlesService } from '../modules/articles/articles.service.js';

export const MAINTENANCE_QUEUE = 'maintenance';

/** Registers recurring maintenance jobs and starts their worker. Returns a closer for graceful shutdown. */
export async function startMaintenanceJobs(
  app: INestApplicationContext,
  env: Env,
): Promise<() => Promise<void>> {
  const logger = new Logger('MaintenanceJobs');
  // BullMQ workers need a connection that never gives up on blocked commands.
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue(MAINTENANCE_QUEUE, { connection });

  await queue.upsertJobScheduler('account-deletions', { every: 15 * 60_000 }, { name: 'account-deletions' });
  await queue.upsertJobScheduler('auth-cleanup', { every: 60 * 60_000 }, { name: 'auth-cleanup' });
  // Attempts whose time ran out while the student was away are submitted automatically (§10).
  await queue.upsertJobScheduler('attempts-expire', { every: 60_000 }, { name: 'attempts-expire' });
  // Payments a student paid but never came back from are settled with their gateway; unpaid orders time out (Phase 11).
  await queue.upsertJobScheduler('payments-reconcile', { every: 60_000 }, { name: 'payments-reconcile' });
  // Receipt emails that could not be sent straight away are retried (D-057).
  await queue.upsertJobScheduler('receipts-email', { every: 60_000 }, { name: 'receipts-email' });
  // Notices that went live, results that are out and exam reminders are queued; push and email deliveries go out and
  // are retried (D-033, D-060); new students get their welcome email (D-061).
  await queue.upsertJobScheduler('notifications', { every: 30_000 }, { name: 'notifications' });

  const deletions = app.get(AccountDeletionService);
  const cleanup = app.get(AuthCleanupService);
  const attempts = app.get(AttemptsService);
  const payments = app.get(PaymentsService);
  const receipts = app.get(ReceiptsService);
  const notices = app.get(NoticesService);
  const notifications = app.get(NotificationsService);
  const exams = app.get(ExamNotificationsService);
  const accountEmails = app.get(AccountEmailsService);
  const articles = app.get(ArticlesService);
  const worker = new Worker(
    MAINTENANCE_QUEUE,
    async (job) => {
      switch (job.name) {
        case 'account-deletions':
          return { erased: await deletions.processDue() };
        case 'auth-cleanup':
          return cleanup.run();
        case 'attempts-expire':
          return { finished: await attempts.finishExpired() };
        case 'payments-reconcile':
          return payments.reconcile();
        case 'receipts-email':
          return { sent: await receipts.sendPending() };
        case 'notifications':
          return {
            notices: await notices.dispatchDue(),
            articles: await articles.dispatchDue(),
            results: await exams.notifyResults(),
            reminders: await exams.sendReminders(),
            sent: await notifications.processDeliveries(),
            welcome: await accountEmails.sendWelcome(),
          };
        default:
          throw new Error(`Unknown maintenance job ${job.name}`);
      }
    },
    { connection, concurrency: 1 },
  );
  worker.on('completed', (job, result) => logger.log({ job: job.name, result }, 'Job completed'));
  worker.on('failed', (job, err) => {
    logger.error({ job: job?.name, err }, 'Job failed');
    reportError(err, { job: job?.name });
  });

  return async () => {
    await worker.close();
    await queue.close();
    await connection.quit();
  };
}
