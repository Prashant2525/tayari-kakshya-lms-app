import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { readdirSync } from 'node:fs';
import nodemailer from 'nodemailer';
import { Redis } from 'ioredis';
import pg from 'pg';
import type { Env } from './env.js';
import { GatewayHttp } from '../modules/payments/gateway-http.js';
import { gatewaysFromEnv } from '../modules/payments/gateways.js';

/**
 * Configuration preflight (deployment guide §10): what an environment's settings mean before the API is started on
 * it. Never prints a value — only variable names and what is wrong. `loadEnv` (the same check the API runs at start-up)
 * comes first; these are the extra checks for a real deployment, and optional connection tests.
 */
export type Level = 'error' | 'warn' | 'info' | 'ok';
export interface Finding {
  level: Level;
  area: string;
  message: string;
}

const isHttps = (v: string | undefined) => Boolean(v?.startsWith('https://'));
const isLocal = (v: string | undefined) =>
  Boolean(v && /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(v));

/** Settings review: errors must be fixed before going live; warnings are worth a look; info is what is switched off. */
export function reviewConfig(env: Env): Finding[] {
  const out: Finding[] = [];
  const add = (level: Level, area: string, message: string) => out.push({ level, area, message });
  const live = env.APP_ENV === 'production' || env.APP_ENV === 'staging';
  // On a live server something a developer can shrug off becomes a mistake.
  const must = live ? 'error' : 'info';
  const should = live ? 'warn' : 'info';

  // Core
  add('ok', 'Core', `APP_ENV=${env.APP_ENV}, NODE_ENV=${env.NODE_ENV}`);
  if (live && env.NODE_ENV !== 'production')
    add('error', 'Core', 'NODE_ENV must be production on a live server');
  if (live && ['debug', 'trace'].includes(env.LOG_LEVEL))
    add('warn', 'Core', 'LOG_LEVEL is very verbose for a live server');
  if (live && env.TRUST_PROXY === false)
    add(
      'warn',
      'Core',
      'TRUST_PROXY=false: behind a reverse proxy every visitor looks like the proxy to the rate limits',
    );
  if (live && env.CORS_ALLOWED_ORIGINS.some((o) => isLocal(o) || o.startsWith('http://')))
    add('error', 'Core', 'CORS_ALLOWED_ORIGINS lists a local or http address');

  // Database / cache
  if (/tayari_dev_only|:PASSWORD@|USER:/.test(env.DATABASE_URL))
    add(must, 'Database', 'DATABASE_URL still has the development or placeholder credentials');
  if (live && !/sslmode=|@(localhost|127\.0\.0\.1|postgres|db)[:/]/.test(env.DATABASE_URL))
    add(
      'warn',
      'Database',
      'DATABASE_URL points at another host without sslmode= — use TLS for a remote database',
    );

  // Email
  if (env.EMAIL_PROVIDER === 'log') add(must, 'Email', 'EMAIL_PROVIDER=log: emails are not sent');
  else add('ok', 'Email', `SMTP ${env.SMTP_HOST ? 'configured' : 'missing host'}`);
  if (live && /@localhost|@example\./i.test(env.EMAIL_FROM))
    add('error', 'Email', 'EMAIL_FROM still uses a placeholder address (mail would be rejected as spam)');
  if (live && env.EMAIL_PROVIDER === 'smtp' && !env.SMTP_USER)
    add('warn', 'Email', 'SMTP_USER is empty — most providers need a login');
  add(
    'info',
    'SMS',
    env.SMS_PROVIDER === 'disabled'
      ? 'off (phone OTP not available; L1 pending)'
      : `SMS_PROVIDER=${env.SMS_PROVIDER}`,
  );

  // Storage
  if (isLocal(env.S3_ENDPOINT))
    add(must, 'Storage', 'S3_ENDPOINT is a local address (SeaweedFS) — use Cloudflare R2');
  if (env.S3_BUCKET_PUBLIC === env.S3_BUCKET_PRIVATE)
    add(
      'error',
      'Storage',
      'S3_BUCKET_PUBLIC and S3_BUCKET_PRIVATE must be different buckets (PDFs would be public)',
    );
  if (/-dev-|-test-/.test(`${env.S3_BUCKET_PUBLIC} ${env.S3_BUCKET_PRIVATE}`) && live)
    add('warn', 'Storage', 'bucket names look like development buckets');

  // Video
  if (env.BUNNY_STREAM_LIBRARY_ID && env.BUNNY_STREAM_API_KEY)
    add(
      env.BUNNY_STREAM_TOKEN_KEY ? 'ok' : must,
      'Video',
      env.BUNNY_STREAM_TOKEN_KEY
        ? 'Bunny Stream configured with signed playback'
        : 'Bunny configured WITHOUT BUNNY_STREAM_TOKEN_KEY: premium videos play unsigned',
    );
  else add(should, 'Video', 'Bunny Stream not configured: premium (Bunny) videos cannot play');
  if (env.BUNNY_STREAM_LIBRARY_ID && !env.BUNNY_CDN_HOSTNAME)
    add('info', 'Video', 'BUNNY_CDN_HOSTNAME empty: no Bunny thumbnails');
  if (!env.YOUTUBE_API_KEY)
    add('info', 'Video', 'YOUTUBE_API_KEY empty: YouTube titles/durations are not fetched automatically');

  // Sign-in
  const google = [
    env.GOOGLE_OAUTH_WEB_CLIENT_ID,
    env.GOOGLE_OAUTH_ANDROID_CLIENT_ID,
    env.GOOGLE_OAUTH_IOS_CLIENT_ID,
  ];
  add(
    google.some(Boolean) ? 'ok' : 'info',
    'Google sign-in',
    google.some(Boolean) ? `${google.filter(Boolean).length} of 3 client ids set` : 'off (no client ids)',
  );

  // Payments
  const gateways = [
    ['eSewa', env.ESEWA_SECRET_KEY && env.ESEWA_PRODUCT_CODE, env.ESEWA_ENV],
    ['Khalti', env.KHALTI_SECRET_KEY, env.KHALTI_ENV],
    ['ConnectIPS', env.CONNECTIPS_MERCHANT_ID, env.CONNECTIPS_ENV],
  ] as const;
  for (const [name, configured, mode] of gateways) {
    if (!configured) add(should, 'Payments', `${name} not configured`);
    else add(live && mode !== 'production' ? 'warn' : 'ok', 'Payments', `${name} configured (${mode})`);
  }
  if (env.ESEWA_PRODUCT_CODE === 'EPAYTEST' && env.APP_ENV === 'production')
    add('error', 'Payments', 'ESEWA_PRODUCT_CODE is eSewa’s public test merchant');
  if (gateways.some(([, c]) => c)) {
    if (!env.PAYMENT_CALLBACK_BASE_URL)
      add('error', 'Payments', 'PAYMENT_CALLBACK_BASE_URL is required when a gateway is configured');
    if (live && !isHttps(env.PAYMENT_RETURN_URL_WEB))
      add('error', 'Payments', 'PAYMENT_RETURN_URL_WEB must be the website’s https payment-result page');
  }

  // Public addresses
  if (live && !isHttps(env.PUBLIC_WEB_URL))
    add('error', 'Website', 'PUBLIC_WEB_URL must be the website’s https address');
  if (!live && !env.PUBLIC_WEB_URL)
    add('info', 'Website', 'PUBLIC_WEB_URL empty: coupon share links are not offered');

  // Notifications and monitoring
  add(
    'info',
    'Push',
    env.EXPO_ACCESS_TOKEN
      ? 'Expo access token set'
      : 'no Expo access token (only needed with Expo enhanced push security)',
  );
  if (!env.SENTRY_DSN_API) add(should, 'Monitoring', 'SENTRY_DSN_API empty: API errors are not reported');
  else add('ok', 'Monitoring', 'Sentry on');
  if (live && !env.APP_RELEASE)
    add('warn', 'Monitoring', 'APP_RELEASE empty: errors are not grouped by deployment');
  return out;
}

export interface Check {
  name: string;
  run: () => Promise<string>;
}

/** Connection tests (`--connect`): each says what it reached or throws a readable reason. Values are never printed. */
export function connectionChecks(env: Env, migrationsDir: string): Check[] {
  const checks: Check[] = [
    {
      name: 'PostgreSQL',
      run: async () => {
        const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
        await client.connect();
        try {
          const expected = readdirSync(migrationsDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);
          const applied = await client
            .query<{ migration_name: string }>(
              'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
            )
            .then((r) => new Set(r.rows.map((x) => x.migration_name)))
            .catch(() => new Set<string>());
          const pending = expected.filter((m) => !applied.has(m));
          if (pending.length)
            throw new Error(
              `reachable, but ${pending.length} migration(s) not applied — run prisma migrate deploy`,
            );
          return `reachable, all ${expected.length} migrations applied`;
        } finally {
          await client.end();
        }
      },
    },
    {
      name: 'Redis',
      run: async () => {
        const redis = new Redis(env.REDIS_URL, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 5000,
        });
        try {
          await redis.connect();
          return `PING → ${await redis.ping()}`;
        } finally {
          redis.disconnect();
        }
      },
    },
    {
      name: 'Object storage',
      run: async () => {
        const s3 = new S3Client({
          endpoint: env.S3_ENDPOINT,
          region: env.S3_REGION,
          forcePathStyle: env.S3_FORCE_PATH_STYLE,
          credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
        });
        try {
          for (const bucket of [env.S3_BUCKET_PUBLIC, env.S3_BUCKET_PRIVATE]) {
            await s3.send(new HeadBucketCommand({ Bucket: bucket })).catch((err: { name?: string }) => {
              throw new Error(`bucket ${bucket}: ${err.name ?? 'not reachable'}`);
            });
          }
          return 'both buckets reachable with these keys';
        } finally {
          s3.destroy();
        }
      },
    },
  ];
  if (env.EMAIL_PROVIDER === 'smtp') {
    checks.push({
      name: 'Email (SMTP)',
      run: async () => {
        const transport = nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
          connectionTimeout: 8000,
        });
        await transport.verify();
        transport.close();
        return 'server accepted the connection and login (no email sent)';
      },
    });
  }
  // Payment gateways (D-076, G-4): the credentials are tried without making a payment.
  const gateways = gatewaysFromEnv(env, new GatewayHttp());
  const probes = [
    [
      'eSewa',
      gateways.esewa,
      'status API answered for this product code (the secret key is checked at payment)',
    ],
    ['Khalti', gateways.khalti, 'secret key accepted'],
    ['ConnectIPS', gateways.connectips, 'app id, password and key accepted by NCHL'],
  ] as const;
  for (const [name, gateway, success] of probes) {
    if (!gateway) continue;
    checks.push({
      name,
      run: async () => {
        const result = await gateway.probe();
        if (!result.ok)
          throw new Error(
            `${gateway.config.mode} gateway answered ${result.status} — check the ${name} credentials and mode`,
          );
        return `${success} (${gateway.config.mode})`;
      },
    });
  }
  if (env.BUNNY_STREAM_LIBRARY_ID && env.BUNNY_STREAM_API_KEY) {
    checks.push({
      name: 'Bunny Stream',
      run: async () => {
        const res = await fetch(
          `https://video.bunnycdn.com/library/${encodeURIComponent(env.BUNNY_STREAM_LIBRARY_ID!)}/videos?page=1&itemsPerPage=1`,
          {
            headers: { AccessKey: env.BUNNY_STREAM_API_KEY!, Accept: 'application/json' },
            signal: AbortSignal.timeout(8000),
          },
        );
        if (!res.ok)
          throw new Error(`library API answered ${res.status} (check the library id and its API key)`);
        return 'library API key accepted';
      },
    });
  }
  return checks;
}
