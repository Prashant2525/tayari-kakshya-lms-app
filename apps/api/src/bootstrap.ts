import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Env } from './config/env.js';
import { ADMIN_CLIENT_HEADER } from './modules/auth/admin-auth.controller.js';

const REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

export function createFastifyAdapter(env: Env): FastifyAdapter {
  return new FastifyAdapter({
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1_048_576,
    // One id per request, shared by Fastify, the logger and error responses (echoed as X-Request-Id).
    genReqId: (raw: IncomingMessage) => {
      const incoming = raw.headers['x-request-id'];
      const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
      raw.headers['x-request-id'] = id;
      return id;
    },
  });
}

/** Shared by main.ts and the e2e tests so tests exercise the real HTTP configuration. */
export async function configureApp(app: NestFastifyApplication, env: Env): Promise<void> {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  const isProdLike = env.APP_ENV === 'production' || env.APP_ENV === 'staging';
  await app.register(fastifyHelmet, { contentSecurityPolicy: isProdLike ? undefined : false });
  await app.register(fastifyCookie);
  app.enableCors({
    origin: env.CORS_ALLOWED_ORIGINS,
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept-Language', 'X-Request-Id', ADMIN_CLIENT_HEADER],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
  });

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onSend', async (request, reply) => {
    void reply.header('X-Request-Id', String(request.id));
  });

  if (!isProdLike) {
    const config = new DocumentBuilder()
      .setTitle('Tayari Kakshya API')
      .setVersion('1')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, config));
  }
}
