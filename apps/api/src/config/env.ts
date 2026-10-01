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

    EMAIL_PROVIDER: z.enum(['smtp', 'log']).default('log'),
    EMAIL_FROM: z.string().default('Tayari Kakshya <no-reply@localhost>'),
    SMTP_HOST: optional,
    SMTP_PORT: z.coerce.number().int().optional(),
    SMTP_USER: optional,
    SMTP_PASSWORD: optional,
    SMTP_SECURE: bool,

    SMS_PROVIDER: z.enum(['disabled', 'log']).default('disabled'),

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
