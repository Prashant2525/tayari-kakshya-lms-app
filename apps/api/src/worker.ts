import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DomainModule } from './app.module.js';
import { loadEnv } from './config/env.js';
import { startMaintenanceJobs } from './jobs/maintenance.jobs.js';

/** Background worker process: BullMQ consumers and schedulers (no HTTP). */
async function main(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.createApplicationContext(DomainModule);
  const stop = await startMaintenanceJobs(app, env);
  new Logger('Worker').log('Worker started');

  const shutdown = async () => {
    await stop();
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
