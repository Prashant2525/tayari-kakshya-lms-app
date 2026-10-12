import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Env } from './config/env.js';
import { ADMIN_CLIENT_HEADER } from './modules/auth/admin-auth.controller.js';

const REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}$/;

/**
 * Browser origins allowed to call the API: the configured list, plus — on a developer machine only
 * (APP_ENV=development) — any http://localhost:<port>, so local tools (admin :5173, Expo web :8081, …) work
 * without editing CORS_ALLOWED_ORIGINS. Staging and production use the list alone.
 */
export function isAllowedOrigin(origin: string, env: Pick<Env, 'APP_ENV' | 'CORS_ALLOWED_ORIGINS'>): boolean {
  return (
    env.CORS_ALLOWED_ORIGINS.includes(origin) || (env.APP_ENV === 'development' && LOCAL_ORIGIN.test(origin))
  );
}

export function createFastifyAdapter(env: Env): FastifyAdapter {
  return new FastifyAdapter({
    trustProxy: env.TRUST_PROXY,
    // JSON bodies (rich-text notes included); file uploads use multipart with their own limits.
    bodyLimit: 2_097_152,
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
  await app.register(fastifyMultipart, {
    limits: {
      files: 1,
      fields: 10,
      fieldSize: 10_000,
      fileSize: Math.max(env.MEDIA_MAX_IMAGE_MB, env.MEDIA_MAX_PDF_MB) * 1024 * 1024,
    },
  });
  app.enableCors({
    // No Origin header (native apps, curl) is not a browser request: CORS does not apply.
    origin: (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) =>
      cb(null, origin === undefined || isAllowedOrigin(origin, env)),
    credentials: true,
    // The CORS library allows only GET, HEAD and POST by default: saves (PUT), edits (PATCH) and deletes from an
    // allowed origin were refused by the browser (Phase 16).
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept-Language',
      'X-Request-Id',
      'X-TK-Platform',
      'X-TK-App-Version',
      ADMIN_CLIENT_HEADER,
    ],
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
