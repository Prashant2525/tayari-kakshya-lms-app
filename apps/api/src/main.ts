import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { configureApp, createFastifyAdapter } from './bootstrap.js';
import { loadEnv } from './config/env.js';
import { flushMonitoring, initMonitoring, reportError } from './infra/monitoring/sentry.js';

async function main(): Promise<void> {
  const env = loadEnv();
  initMonitoring(env, 'api');
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter(env), {
    bufferLogs: true,
  });
  await configureApp(app, env);
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

main().catch(async (err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  reportError(err);
  await flushMonitoring();
  process.exit(1);
});
