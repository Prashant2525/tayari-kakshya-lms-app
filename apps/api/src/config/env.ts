import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  );
const bool = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((v) => v === 'true' || v === '1');
/**
 * Which proxies may tell the API the visitor's address (X-Forwarded-For): `false`, or the proxies' addresses / CIDR
 * ranges (`127.0.0.1,10.0.0.0/8`) — then a forged header from anyone else is ignored. `true` trusts any sender and is
 * refused in staging and production (rate limits by IP could be dodged).
 */
const trustProxy = z
  .string()
  .default('false')
  .transform((v) => v.trim())
  .pipe(
    z.union([
      z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1'),
      z
        .string()
        .regex(
          /^[0-9a-fA-F:.]+(\/\d{1,3})?(\s*,\s*[0-9a-fA-F:.]+(\/\d{1,3})?)*$/,
          'a list of IP addresses or CIDR ranges',
        )
        .transform((v) => v.split(',').map((x) => x.trim())),
    ]),
  );
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));
/** An integer setting that may be left empty in .env (then the default applies). */
const int = (min: number, max: number, fallback: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.coerce.number().int().min(min).max(max).default(fallback),
  );
const gatewayMode = z.enum(['sandbox', 'production']).default('sandbox');

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    TRUST_PROXY: trustProxy,
    /** Requests per minute per IP on routes without their own limit (all routes also keep their own limits). */
    RATE_LIMIT_DEFAULT_PER_MINUTE: z.coerce.number().int().min(60).max(100_000).default(300),
    CORS_ALLOWED_ORIGINS: csv,

    DATABASE_URL: z.string().min(1),
    /** Database connections per process (API, worker). Keep API + worker below the server's max_connections. */
    DATABASE_POOL_MAX: int(2, 200, 20),
    REDIS_URL: z.string().min(1),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    REFRESH_TOKEN_PEPPER: z.string().min(32),
    OTP_PEPPER: z.string().min(32),
    /** Encrypts secrets stored in the database (TOTP). Rotating it invalidates enrolled authenticators. */
    ENCRYPTION_KEY: z.string().min(32),

    EMAIL_PROVIDER: z.enum(['smtp', 'log']).default('log'),
    EMAIL_FROM: z.string().default('Tayari Kakshya <no-reply@localhost>'),
    SMTP_HOST: optional,
    SMTP_PORT: z.coerce.number().int().optional(),
    SMTP_USER: optional,
    SMTP_PASSWORD: optional,
    SMTP_SECURE: bool,

    SMS_PROVIDER: z.enum(['disabled', 'log']).default('disabled'),

    // Object storage (S3-compatible: Cloudflare R2 in production, SeaweedFS locally — T-020).
    S3_ENDPOINT: z.string().min(1),
    S3_REGION: z.string().default('auto'),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_BUCKET_PUBLIC: z.string().min(3),
    S3_BUCKET_PRIVATE: z.string().min(3),
    S3_FORCE_PATH_STYLE: bool,
    /** Base URL for public objects (R2 public domain / CDN in production; the API dev proxy locally). */
    PUBLIC_MEDIA_BASE_URL: z.string().min(1),
    /** Serve public objects through the API (development/test only). */
    PUBLIC_MEDIA_PROXY: bool,
    /** Create buckets on start-up (development/test only). */
    STORAGE_AUTO_CREATE_BUCKETS: bool,
    MEDIA_MAX_IMAGE_MB: z.coerce.number().int().min(1).max(50).default(10),
    MEDIA_MAX_PDF_MB: z.coerce.number().int().min(1).max(500).default(100),

    // Video (D-015). Bunny values come from the owner's Bunny Stream library; all optional until provided.
    BUNNY_STREAM_LIBRARY_ID: optional,
    BUNNY_STREAM_API_KEY: optional,
    BUNNY_STREAM_TOKEN_KEY: optional,
    BUNNY_CDN_HOSTNAME: optional,
    YOUTUBE_API_KEY: optional,
    /**
     * Lifetime of signed Bunny embed URLs. The token is only checked when the player loads; Bunny then signs the CDN
     * segment URLs itself (verified 2026-10-03: ~10 h), so a short lifetime limits link sharing without cutting off
     * long lectures. Bunny recommends short-lived tokens.
     */
    VIDEO_PLAYBACK_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(300),

    GOOGLE_OAUTH_WEB_CLIENT_ID: optional,
    GOOGLE_OAUTH_ANDROID_CLIENT_ID: optional,
    GOOGLE_OAUTH_IOS_CLIENT_ID: optional,

    // Error monitoring (D-039): off when unset. APP_RELEASE (e.g. the git commit) groups errors by deployment.
    SENTRY_DSN_API: z
      .url()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    APP_RELEASE: optional,

    // Payments (D-003, D-051). Every merchant value comes from here: switching a gateway from test to production is a
    // .env change only. A gateway is available when its credentials are set; its endpoints follow its mode unless
    // given explicitly.
    /** Public origin of this API that the gateways send students back to, e.g. https://api.example.com. */
    PAYMENT_CALLBACK_BASE_URL: optional,
    /** Where students land after paying (allow-listed): the app's deep link and the website page. */
    PAYMENT_RETURN_URL_APP: z.string().default('tayarikakshya://payment-result'),
    PAYMENT_RETURN_URL_WEB: optional,
    // Push notifications through Expo (T-011). The access token is optional (Expo's 'enhanced security' for push).
    EXPO_PUSH_URL: z.url().default('https://exp.host/--/api/v2/push/send'),
    EXPO_ACCESS_TOKEN: optional,
    /** Where students open Tayari Kakshya on the web (coupon share links, D-056), e.g. https://app.example.com. */
    PUBLIC_WEB_URL: optional,
    /** How long an unpaid order can still be paid. */
    PAYMENT_ORDER_TTL_MINUTES: int(5, 1440, 60),
    ESEWA_ENV: gatewayMode,
    ESEWA_PRODUCT_CODE: optional,
    ESEWA_SECRET_KEY: optional,
    ESEWA_FORM_URL: optional,
    ESEWA_STATUS_URL: optional,
    KHALTI_ENV: gatewayMode,
    KHALTI_BASE_URL: optional,
    KHALTI_SECRET_KEY: optional,
  })
  .superRefine((env, ctx) => {
    const prodLike = env.APP_ENV === 'production' || env.APP_ENV === 'staging';
    if (prodLike && env.EMAIL_PROVIDER === 'log') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'log email provider is not allowed here',
      });
    }
    // Premium video must never fall back to unsigned links (T-031, KI-023).
    if (prodLike && env.BUNNY_STREAM_LIBRARY_ID && !env.BUNNY_STREAM_TOKEN_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['BUNNY_STREAM_TOKEN_KEY'],
        message: 'required when BUNNY_STREAM_LIBRARY_ID is set (without it premium videos play unsigned)',
      });
    }
    // Each secret protects something different; one leaked value must not unlock the others.
    const secrets = ['JWT_ACCESS_SECRET', 'REFRESH_TOKEN_PEPPER', 'OTP_PEPPER', 'ENCRYPTION_KEY'] as const;
    if (prodLike && new Set(secrets.map((k) => env[k])).size !== secrets.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: `${secrets.join(', ')} must all be different values`,
      });
    }
    if (prodLike && !env.PUBLIC_MEDIA_BASE_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_MEDIA_BASE_URL'],
        message: 'an https address is required here (pictures would be blocked as mixed content)',
      });
    }
    if (prodLike && env.TRUST_PROXY === true) {
      ctx.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY'],
        message: "list the reverse proxy's and the website server's addresses instead of true",
      });
    }
    if (prodLike && env.SMS_PROVIDER === 'log') {
      ctx.addIssue({
        code: 'custom',
        path: ['SMS_PROVIDER'],
        message: 'log SMS provider is not allowed here',
      });
    }
    if (prodLike && (env.PUBLIC_MEDIA_PROXY || env.STORAGE_AUTO_CREATE_BUCKETS)) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_MEDIA_PROXY'],
        message: 'media proxy / bucket auto-creation are development-only',
      });
    }
    // A test gateway in production would hand out access for test money.
    for (const [name, mode, configured] of [
      ['ESEWA_ENV', env.ESEWA_ENV, Boolean(env.ESEWA_SECRET_KEY)],
      ['KHALTI_ENV', env.KHALTI_ENV, Boolean(env.KHALTI_SECRET_KEY)],
    ] as const) {
      if (env.APP_ENV === 'production' && configured && mode !== 'production') {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: 'a sandbox payment gateway is not allowed in production',
        });
      }
    }
    if (
      prodLike &&
      (env.ESEWA_SECRET_KEY || env.KHALTI_SECRET_KEY) &&
      !env.PAYMENT_CALLBACK_BASE_URL?.startsWith('https://')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_CALLBACK_BASE_URL'],
        message: 'an https address is required when a payment gateway is configured',
      });
    }
    if (env.EMAIL_PROVIDER === 'smtp' && (!env.SMTP_HOST || !env.SMTP_PORT)) {
      ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'SMTP_HOST and SMTP_PORT are required' });
    }
  });

export type Env = z.infer<typeof EnvSchema>;
export const ENV = Symbol('ENV');

/** Parses process.env once; fails fast with a readable list of problems (never prints values). */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
