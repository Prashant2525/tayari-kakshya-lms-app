/* eslint-disable no-console -- command-line script */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DomainModule } from '../app.module.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { DEFAULT_NODE_TYPES } from '../modules/content/default-node-types.js';
import { RedisService } from '../infra/redis/redis.provider.js';
import { PasswordService } from '../modules/auth/password.service.js';
import { RbacService } from '../modules/rbac/rbac.service.js';
import { isSettingKey, SETTINGS } from '@tk/contracts';

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
  'assessments:edit',
  'assessments:publish',
  'grading:manage',
  'certificates:manage',
  'orders:read',
  'orders:manage',
  'plans:manage',
  'coupons:manage',
  'refunds:request',
  'refunds:approve',
  'notices:edit',
  'notices:publish',
  'courses:notify',
  'interests:manage',
  'articles:edit',
  'articles:publish',
  'pages:manage',
  'support:manage',
  'banners:manage',
  'reviews:moderate',
  'discussions:moderate',
  'live:manage',
  'campaigns:send',
  'home:manage',
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
      // More editors keep each account under the staff sign-in limit (5 per 15 minutes) across a full run.
      const editors = [
        { email: editorEmail, fullName: 'E2E Editor' },
        ...(process.env['E2E_EDITOR2_EMAIL']
          ? [{ email: process.env['E2E_EDITOR2_EMAIL'], fullName: 'E2E Second Editor' }]
          : []),
        ...(process.env['E2E_EDITOR3_EMAIL']
          ? [{ email: process.env['E2E_EDITOR3_EMAIL'], fullName: 'E2E Third Editor' }]
          : []),
      ];
      for (const editor of editors) {
        await prisma.user.create({
          data: { kind: 'staff', ...editor, passwordHash, roles: { create: { roleId: editorRole.id } } },
        });
      }
    }
    // Made here rather than through sign-up, which allows 10 accounts per IP per hour.
    for (const studentEmail of [
      process.env['E2E_STUDENT_EMAIL'],
      process.env['E2E_STUDENT2_EMAIL'],
      process.env['E2E_STUDENT3_EMAIL'],
      process.env['E2E_STUDENT4_EMAIL'],
    ]) {
      if (!studentEmail) continue;
      await prisma.user.create({
        data: { kind: 'student', email: studentEmail, fullName: 'E2E Student', passwordHash },
      });
    }
    // CMS settings a suite starts with (test values), e.g. the referral programme switched on.
    const settings = JSON.parse(process.env['E2E_SETTINGS'] ?? '{}') as Record<string, unknown>;
    for (const [key, value] of Object.entries(settings)) {
      if (!isSettingKey(key)) throw new Error(`E2E_SETTINGS: unknown setting ${key}`);
      const parsed = SETTINGS[key].schema.parse(value) as object;
      await prisma.systemSetting.upsert({
        where: { key },
        create: { key, value: parsed },
        update: { value: parsed },
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
