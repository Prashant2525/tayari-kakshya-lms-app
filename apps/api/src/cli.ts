/* eslint-disable no-console -- command-line tool: console output is its interface */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Email } from '@tk/contracts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import { DomainModule } from './app.module.js';
import { loadEnv, type Env } from './config/env.js';
import { connectionChecks, reviewConfig, type Level } from './config/preflight.js';
import { flushMonitoring, initMonitoring, reportError } from './infra/monitoring/sentry.js';
import { PrismaService } from './infra/prisma/prisma.service.js';
import { AuditService } from './modules/audit/audit.service.js';
import { OtpService } from './modules/auth/otp.service.js';
import { RbacService } from './modules/rbac/rbac.service.js';

const USAGE = `Usage:
  pnpm --filter @tk/api cli create-super-admin --email <email> --name "<full name>"

Creates (or promotes) a staff account with the protected Super Admin role. No password is accepted on the
command line: a password-setup code is emailed and the person sets their own password.

  pnpm --filter @tk/api cli monitoring-test

Sends one test error to Sentry (SENTRY_DSN_API) to confirm error monitoring works in this environment.

  pnpm --filter @tk/api cli config-check [--connect] [--env-file <path>]

Checks this environment's settings (the root .env locally, the server's environment in production; or only the given
file) without printing any value: the start-up validation, then what a live server needs (APP_ENV staging /
production turns warnings into errors). --connect also tries the database (and pending migrations), Redis, both
storage buckets, the SMTP login and the Bunny library key. Exit code 1 when something must be fixed.`;

const LABEL: Record<Level, string> = { error: 'ERROR', warn: 'WARN ', info: 'info ', ok: 'ok   ' };

async function configCheck(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: { connect: { type: 'boolean' }, 'env-file': { type: 'string' } },
  });
  let env: Env;
  try {
    const file = values['env-file'];
    env = loadEnv(file ? (parseEnv(readFileSync(file, 'utf8')) as NodeJS.ProcessEnv) : process.env);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error('\nFix the settings above (see docs/ENVIRONMENT_AND_PRODUCTION_DEPLOYMENT_GUIDE.md).');
    process.exitCode = 1;
    return;
  }
  console.log('Start-up validation: passed\n');
  const findings = reviewConfig(env);
  for (const f of findings) console.log(`${LABEL[f.level]}  ${f.area.padEnd(15)} ${f.message}`);
  let failed = findings.filter((f) => f.level === 'error').length;
  if (values.connect) {
    console.log('\nConnections:');
    const migrations = fileURLToPath(new URL('../prisma/migrations', import.meta.url));
    for (const check of connectionChecks(env, migrations)) {
      try {
        console.log(`ok     ${check.name.padEnd(15)} ${await check.run()}`);
      } catch (err) {
        failed++;
        const reason = err instanceof Error ? err.message : String(err);
        console.log(`ERROR  ${check.name.padEnd(15)} ${reason}`);
      }
    }
  }
  const warnings = findings.filter((f) => f.level === 'warn').length;
  console.log(`\n${failed} error(s), ${warnings} warning(s) for APP_ENV=${env.APP_ENV}.`);
  if (failed) process.exitCode = 1;
}

async function monitoringTest(): Promise<void> {
  const env = loadEnv();
  if (!initMonitoring(env, 'api')) {
    console.error('SENTRY_DSN_API is not set: error monitoring is off in this environment.');
    process.exitCode = 1;
    return;
  }
  reportError(new Error(`Monitoring test from the API command line (${env.APP_ENV})`), {
    job: 'monitoring-test',
  });
  await flushMonitoring(5000);
  console.log(
    `Test error sent to Sentry (environment "${env.APP_ENV}"). It should appear under Issues shortly.`,
  );
}

async function createSuperAdmin(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { email: { type: 'string' }, name: { type: 'string' } } });
  const email = Email.safeParse(values.email ?? '');
  if (!email.success || !values.name || values.name.trim().length < 2) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(DomainModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const rbac = app.get(RbacService);
    const audit = app.get(AuditService);
    const user = await prisma.$transaction(async (tx) => {
      const role = await rbac.ensureSuperAdminRole(tx);
      const existing = await tx.user.findUnique({ where: { email: email.data } });
      if (existing && existing.kind !== 'staff') {
        throw new Error('That email belongs to a student account; use a different email for staff.');
      }
      const staff =
        existing ??
        (await tx.user.create({ data: { kind: 'staff', email: email.data, fullName: values.name!.trim() } }));
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: staff.id, roleId: role.id } },
        create: { userId: staff.id, roleId: role.id },
        update: {},
      });
      await audit.record(
        {
          actorUserId: null,
          action: 'staff.super_admin_granted_via_cli',
          entityType: 'user',
          entityId: staff.id,
        },
        tx,
      );
      return staff;
    });

    if (!user.passwordHash) {
      await app.get(OtpService).send({
        purpose: 'reset_password',
        channel: 'email',
        target: email.data,
        userId: user.id,
        locale: user.locale,
      });
      console.log(`Super Admin ready: ${email.data}. A password-setup code was emailed (valid 10 minutes).`);
      console.log('Set the password with POST /api/v1/auth/password/reset { email, code, newPassword }.');
    } else {
      console.log(`Super Admin role granted to existing staff account ${email.data}.`);
    }
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'create-super-admin') return createSuperAdmin(args);
  if (command === 'monitoring-test') return monitoringTest();
  if (command === 'config-check') return configCheck(args);
  console.error(USAGE);
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
