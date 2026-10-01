import { Logger, type INestApplicationContext } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import { AccountDeletionService } from '../modules/auth/account-deletion.service.js';
import { AuthCleanupService } from '../modules/auth/auth-cleanup.service.js';

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

  const deletions = app.get(AccountDeletionService);
  const cleanup = app.get(AuthCleanupService);
  const worker = new Worker(
    MAINTENANCE_QUEUE,
    async (job) => {
      switch (job.name) {
        case 'account-deletions':
          return { erased: await deletions.processDue() };
        case 'auth-cleanup':
          return cleanup.run();
        default:
          throw new Error(`Unknown maintenance job ${job.name}`);
      }
    },
    { connection, concurrency: 1 },
  );
  worker.on('completed', (job, result) => logger.log({ job: job.name, result }, 'Job completed'));
  worker.on('failed', (job, err) => logger.error({ job: job?.name, err }, 'Job failed'));

  return async () => {
    await worker.close();
    await queue.close();
    await connection.quit();
  };
}
