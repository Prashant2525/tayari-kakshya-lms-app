/* eslint-disable no-console -- command-line script */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DomainModule } from '../app.module.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { DEFAULT_NODE_TYPES } from '../modules/content/default-node-types.js';
import { RedisService } from '../infra/redis/redis.provider.js';
import { PasswordService } from '../modules/auth/password.service.js';
import { RbacService } from '../modules/rbac/rbac.service.js';

/** Content team role for browser tests of the content CMS (no 2FA is required for non-Super Admins by default). */
const CONTENT_PERMISSIONS = [
  'media:manage',
  'taxonomy:manage',
  'content:edit',
  'content:publish',
  'courses:edit',
  'courses:publish',
  'courses:pricing',
  'instructors:manage',
  'entitlements:grant',
  'users:read',
  'questions:edit',
  'questions:publish',
  'question_reports:manage',
];

/**
 * Resets the browser end-to-end test database (and its Redis logical DB) and creates one Super Admin, plus a
 * content editor when E2E_EDITOR_EMAIL is set.
 * Refuses to run unless the database name ends with `_e2e` and APP_ENV is not production/staging.
 */
async function main(): Promise<void> {
  const url = new URL(process.env['DATABASE_URL'] ?? '');
  const appEnv = process.env['APP_ENV'] ?? 'development';
  const email = process.env['E2E_ADMIN_EMAIL'];
  const password = process.env['E2E_ADMIN_PASSWORD'];
  if (!url.pathname.endsWith('_e2e') || appEnv === 'production' || appEnv === 'staging') {
    throw new Error(
      'Refusing to seed: DATABASE_URL must point to a *_e2e database outside production/staging.',
    );
  }
  if (!email || !password) throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required.');

  const app = await NestFactory.createApplicationContext(DomainModule, { logger: ['error'] });
  try {
    const prisma = app.get(PrismaService);
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
    // Restore reference data that migrations seed (category types).
    await prisma.examNodeType.createMany({ data: [...DEFAULT_NODE_TYPES] });
    // Clear rate-limit counters from previous runs (E2E Redis logical database only).
    await app.get(RedisService).client.flushdb();
    const role = await app.get(RbacService).ensureSuperAdminRole();
    const passwordHash = await app.get(PasswordService).hash(password);
    await prisma.user.create({
      data: {
        kind: 'staff',
        email,
        fullName: 'E2E Admin',
        passwordHash,
        roles: { create: { roleId: role.id } },
      },
    });
    const editorEmail = process.env['E2E_EDITOR_EMAIL'];
    if (editorEmail) {
      const editorRole = await prisma.role.create({
        data: {
          name: 'E2E Content Team',
          permissions: { create: CONTENT_PERMISSIONS.map((permission) => ({ permission })) },
        },
      });
      await prisma.user.create({
        data: {
          kind: 'staff',
          email: editorEmail,
          fullName: 'E2E Editor',
          passwordHash,
          roles: { create: { roleId: editorRole.id } },
        },
      });
    }
    console.log(
      `E2E database reset; Super Admin ${email} created${editorEmail ? `, editor ${editorEmail}` : ''}.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
