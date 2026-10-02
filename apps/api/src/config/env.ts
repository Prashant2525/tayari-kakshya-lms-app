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
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    TRUST_PROXY: bool,
    CORS_ALLOWED_ORIGINS: csv,

    DATABASE_URL: z.string().min(1),
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
