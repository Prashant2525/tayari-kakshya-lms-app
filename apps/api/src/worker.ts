import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { WorkerModule } from './app.module.js';
import { loadEnv } from './config/env.js';
import { flushMonitoring, initMonitoring, reportError } from './infra/monitoring/sentry.js';
import { startMaintenanceJobs } from './jobs/maintenance.jobs.js';

/** Background worker process: BullMQ consumers and schedulers (no HTTP). */
async function main(): Promise<void> {
  const env = loadEnv();
  initMonitoring(env, 'worker');
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  // Structured JSON logs like the API's (KI-015); Nest's Logger instances in the jobs write through it.
  app.useLogger(app.get(PinoLogger));
  const stop = await startMaintenanceJobs(app, env);
  new Logger('Worker').log('Worker started');

  const shutdown = async () => {
    await stop();
    await app.close();
    await flushMonitoring();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

main().catch(async (err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  reportError(err);
  await flushMonitoring();
  process.exit(1);
});
