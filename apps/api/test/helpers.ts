import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { AuthTokens, DeviceInfo } from '@tk/contracts';
import { AppModule } from '../src/app.module.js';
import { configureApp, createFastifyAdapter } from '../src/bootstrap.js';
import { loadEnv } from '../src/config/env.js';
import { MailService } from '../src/infra/messaging/mail.service.js';
import { SmsService } from '../src/infra/messaging/sms.service.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisService } from '../src/infra/redis/redis.provider.js';
import { GoogleVerifier, type GoogleIdentity } from '../src/modules/auth/google-verifier.js';
import { RbacService } from '../src/modules/rbac/rbac.service.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import type { SettingKey } from '@tk/contracts';

export class FakeGoogleVerifier extends GoogleVerifier {
  readonly tokens = new Map<string, GoogleIdentity>();
  async verify(idToken: string): Promise<GoogleIdentity> {
    const identity = this.tokens.get(idToken);
    if (!identity) {
      const { AppError } = await import('../src/common/errors/app-error.js');
      throw new AppError(401, 'GOOGLE_TOKEN_INVALID', 'Google sign-in could not be verified');
    }
    return identity;
  }
}

export interface TestContext {
  app: NestFastifyApplication;
  prisma: PrismaService;
  mail: MailService;
  sms: SmsService;
  google: FakeGoogleVerifier;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestApp(): Promise<TestContext> {
  const env = loadEnv();
  const google = new FakeGoogleVerifier();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GoogleVerifier)
    .useValue(google)
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(env), {
    logger: false,
  });
  await configureApp(app, env);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const prisma = app.get(PrismaService);
  const redis = app.get(RedisService);
  const mail = app.get(MailService);
  const sms = app.get(SmsService);
  const settings = app.get(SettingsService);

  return {
    app,
    prisma,
    mail,
    sms,
    google,
    async reset() {
      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
      );
      await redis.client.flushdb();
      settings.clearCache();
      mail.outbox.length = 0;
      sms.outbox.length = 0;
      google.tokens.clear();
    },
    async close() {
      await app.close();
    },
  };
}

// ───────────── HTTP helpers ─────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests assert on dynamic JSON bodies
export interface Res<T = any> {
  status: number;
  body: T;
  headers: Record<string, string | string[] | undefined>;
  cookies: Array<{ name: string; value: string; path?: string; httpOnly?: boolean; sameSite?: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see Res
export async function call<T = any>(
  ctx: TestContext,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string>; ip?: string } = {},
): Promise<Res<T>> {
  const res = await ctx.app.inject({
    method,
    url: `/api/v1${url}`,
    payload: opts.body as object | undefined,
    remoteAddress: opts.ip,
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...opts.headers,
    },
  });
  return {
    status: res.statusCode,
    body: res.body ? safeJson(res.body) : undefined,
    headers: res.headers as Res['headers'],
    cookies: res.cookies as Res['cookies'],
  };
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

let deviceSeq = 0;
export function device(name = 'Test phone'): DeviceInfo {
  deviceSeq += 1;
  return {
    deviceId: `test-device-${deviceSeq.toString().padStart(4, '0')}`,
    deviceName: name,
    platform: 'android',
  };
}

export const PASSWORD = 'correct horse battery';

export async function registerStudent(
  ctx: TestContext,
  email = 'asha@example.com',
  dev: DeviceInfo = device(),
): Promise<AuthTokens> {
  const res = await call<AuthTokens>(ctx, 'POST', '/auth/register', {
    body: { fullName: 'Asha Rai', email, password: PASSWORD, acceptTerms: true, device: dev },
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

/** Last 6-digit code mailed to an address (log provider). */
export function lastEmailCode(ctx: TestContext, to: string): string {
  const mail = [...ctx.mail.outbox].reverse().find((m) => m.to === to);
  const code = mail?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`No code mailed to ${to}`);
  return code;
}

export async function setSetting(ctx: TestContext, key: SettingKey, value: unknown): Promise<void> {
  await ctx.prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
  ctx.app.get(SettingsService).clearCache();
}

/** Creates a staff user with a password and the given roles (bypassing the invitation email). */
export async function createStaff(
  ctx: TestContext,
  email: string,
  opts: { superAdmin?: boolean; permissions?: string[] } = {},
): Promise<{ id: string; email: string }> {
  const { PasswordService } = await import('../src/modules/auth/password.service.js');
  const passwordHash = await ctx.app.get(PasswordService).hash(PASSWORD);
  const user = await ctx.prisma.user.create({
    data: { kind: 'staff', email, fullName: `Staff ${email}`, passwordHash },
  });
  if (opts.superAdmin) {
    const role = await ctx.app.get(RbacService).ensureSuperAdminRole();
    await ctx.prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  if (opts.permissions) {
    const role = await ctx.prisma.role.create({
      data: {
        name: `role-${email}`,
        permissions: { create: opts.permissions.map((permission) => ({ permission })) },
      },
    });
    await ctx.prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  return { id: user.id, email };
}

export const ADMIN_HEADERS = { 'x-tk-client': 'admin' };

export async function staffLogin(
  ctx: TestContext,
  email: string,
): Promise<{ token: string; refreshCookie: string }> {
  const res = await call(ctx, 'POST', '/admin/auth/login', {
    body: { email, password: PASSWORD },
    headers: ADMIN_HEADERS,
  });
  if (res.status !== 200) throw new Error(`staff login failed: ${res.status} ${JSON.stringify(res.body)}`);
  const cookie = res.cookies.find((c) => c.name === 'tk_admin_rt');
  if (!cookie) throw new Error('no refresh cookie');
  return { token: res.body.accessToken, refreshCookie: cookie.value };
}
