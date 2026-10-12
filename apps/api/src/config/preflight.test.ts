import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';
import { reviewConfig } from './preflight.js';

const secret = () => randomBytes(32).toString('base64url');

/** A plausible production configuration (placeholders, no real credentials). */
function production(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    APP_ENV: 'production',
    TRUST_PROXY: '127.0.0.1,172.18.0.0/16',
    CORS_ALLOWED_ORIGINS: 'https://admin.example.np',
    DATABASE_URL: 'postgresql://tayari_app:pw@postgres:5432/tayari_kakshya',
    REDIS_URL: 'redis://redis:6379',
    JWT_ACCESS_SECRET: secret(),
    REFRESH_TOKEN_PEPPER: secret(),
    OTP_PEPPER: secret(),
    ENCRYPTION_KEY: secret(),
    EMAIL_PROVIDER: 'smtp',
    EMAIL_FROM: 'Tayari Kakshya <no-reply@mail.example.np>',
    SMTP_HOST: 'smtp.provider.example',
    SMTP_PORT: '587',
    SMTP_USER: 'apikey',
    SMTP_PASSWORD: 'x',
    S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    S3_ACCESS_KEY_ID: 'id',
    S3_SECRET_ACCESS_KEY: 'key',
    S3_BUCKET_PUBLIC: 'tayari-public',
    S3_BUCKET_PRIVATE: 'tayari-private',
    PUBLIC_MEDIA_BASE_URL: 'https://media.example.np',
    BUNNY_STREAM_LIBRARY_ID: '12345',
    BUNNY_STREAM_API_KEY: 'k',
    BUNNY_STREAM_TOKEN_KEY: 't',
    PUBLIC_WEB_URL: 'https://example.np',
    PAYMENT_CALLBACK_BASE_URL: 'https://api.example.np',
    PAYMENT_RETURN_URL_WEB: 'https://example.np/payment-result',
    KHALTI_ENV: 'production',
    KHALTI_SECRET_KEY: 'live',
    SENTRY_DSN_API: 'https://public@o1.ingest.sentry.io/1',
    APP_RELEASE: 'abc123',
    ...extra,
  };
}
const errors = (env: NodeJS.ProcessEnv) =>
  reviewConfig(loadEnv(env))
    .filter((f) => f.level === 'error')
    .map((f) => f.message);

describe('production start-up rules (deployment guide §10)', () => {
  it('accepts a complete production configuration', () => {
    expect(() => loadEnv(production())).not.toThrow();
  });

  it('refuses unsigned premium video, shared secrets and http media', () => {
    expect(() => loadEnv(production({ BUNNY_STREAM_TOKEN_KEY: undefined }))).toThrow(
      /BUNNY_STREAM_TOKEN_KEY/,
    );
    const same = secret();
    expect(() => loadEnv(production({ JWT_ACCESS_SECRET: same, OTP_PEPPER: same }))).toThrow(
      /must all be different/,
    );
    expect(() => loadEnv(production({ PUBLIC_MEDIA_BASE_URL: 'http://media.example.np' }))).toThrow(
      /PUBLIC_MEDIA_BASE_URL/,
    );
  });

  it('never prints a value in its messages', () => {
    const env = production({ JWT_ACCESS_SECRET: 'short-secret-value' });
    expect(() => loadEnv(env)).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => loadEnv(env)).not.toThrow(/short-secret-value/);
  });
});

describe('reviewConfig (config-check)', () => {
  it('finds nothing to fix in a complete production configuration', () => {
    expect(errors(production())).toEqual([]);
  });

  it('flags what would break a live server', () => {
    const found = errors(
      production({
        DATABASE_URL: 'postgresql://tayari:tayari_dev_only@postgres:5432/tayari_kakshya',
        EMAIL_FROM: 'Tayari Kakshya <no-reply@localhost>',
        S3_ENDPOINT: 'http://localhost:8333',
        S3_BUCKET_PRIVATE: 'tayari-public',
        PUBLIC_WEB_URL: 'http://example.np',
        PAYMENT_RETURN_URL_WEB: undefined,
        CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
      }),
    );
    expect(found).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/DATABASE_URL/),
        expect.stringMatching(/EMAIL_FROM/),
        expect.stringMatching(/S3_ENDPOINT/),
        expect.stringMatching(/must be different buckets/),
        expect.stringMatching(/PUBLIC_WEB_URL/),
        expect.stringMatching(/PAYMENT_RETURN_URL_WEB/),
        expect.stringMatching(/CORS_ALLOWED_ORIGINS/),
      ]),
    );
  });

  it('refuses eSewa’s public test merchant in production', () => {
    expect(
      errors(production({ ESEWA_ENV: 'production', ESEWA_PRODUCT_CODE: 'EPAYTEST', ESEWA_SECRET_KEY: 'x' })),
    ).toEqual([expect.stringMatching(/test merchant/)]);
  });

  it('only informs on a development machine', () => {
    const dev = reviewConfig(
      loadEnv({
        ...production(),
        NODE_ENV: 'development',
        APP_ENV: 'development',
        EMAIL_PROVIDER: 'log',
        S3_ENDPOINT: 'http://localhost:8333',
      }),
    );
    expect(dev.filter((f) => f.level === 'error')).toEqual([]);
    expect(dev).toEqual(expect.arrayContaining([expect.objectContaining({ area: 'Email', level: 'info' })]));
  });
});
