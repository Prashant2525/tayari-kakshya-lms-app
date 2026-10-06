// Test-only environment for browser E2E runs (API server + seeding). Never used outside tests.
import { config } from 'dotenv';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_EDITOR2_EMAIL, E2E_EDITOR_EMAIL } from './accounts.mjs';
import { fakeGatewayEnv } from './fake-gateway.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../../.env'), quiet: true });

export { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_EDITOR2_EMAIL, E2E_EDITOR_EMAIL } from './accounts.mjs';

export const apiDir = path.resolve(here, '../../../apps/api');

const secret = () => randomBytes(48).toString('base64url');

/**
 * Builds the API environment for one E2E suite. Each suite gets its own database (`<base>[_<name>]_e2e`),
 * Redis logical database and port, so the admin and student-app suites can run side by side.
 *
 * @param {{ name?: string, apiPort: number, webOrigin: string, redisDb: number, email?: 'log' | 'smtp' }} options
 */
export function createE2eEnv({ name, apiPort, webOrigin, redisDb, email = 'log' }) {
  const base = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (!base) throw new Error('Set E2E_DATABASE_URL or TEST_DATABASE_URL');
  const dbUrl = new URL(base);
  const stem = dbUrl.pathname.replace(/_e2e$/, '').replace(/_test$/, '');
  dbUrl.pathname = `${stem}${name ? `_${name}` : ''}_e2e`;
  const redisBase = (process.env.REDIS_URL ?? 'redis://localhost:6379').replace(/\/\d+$/, '');

  return {
    ...process.env,
    NODE_ENV: 'test',
    APP_ENV: 'test',
    LOG_LEVEL: 'warn',
    PORT: String(apiPort),
    DATABASE_URL: dbUrl.toString(),
    REDIS_URL: `${redisBase}/${redisDb}`,
    EMAIL_PROVIDER: email,
    // `smtp` delivers to Mailpit (local dev compose / CI service) so tests can read verification codes.
    SMTP_HOST: process.env.E2E_SMTP_HOST ?? 'localhost',
    SMTP_PORT: process.env.E2E_SMTP_PORT ?? '1025',
    SMTP_SECURE: 'false',
    SMTP_USER: '',
    SMTP_PASSWORD: '',
    SMS_PROVIDER: 'log',
    CORS_ALLOWED_ORIGINS: webOrigin,
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? secret(),
    REFRESH_TOKEN_PEPPER: process.env.REFRESH_TOKEN_PEPPER ?? secret(),
    OTP_PEPPER: process.env.OTP_PEPPER ?? secret(),
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? secret(),
    S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://localhost:8333',
    S3_REGION: process.env.S3_REGION ?? 'us-east-1',
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? 'tayari_dev_access',
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? 'tayari_dev_secret_only',
    S3_FORCE_PATH_STYLE: 'true',
    S3_BUCKET_PUBLIC: 'tayari-e2e-public',
    S3_BUCKET_PRIVATE: 'tayari-e2e-private',
    PUBLIC_MEDIA_BASE_URL: `${webOrigin}/api/v1/public-media`,
    PUBLIC_MEDIA_PROXY: 'true',
    STORAGE_AUTO_CREATE_BUCKETS: 'true',
    // Never call real providers from browser tests, even when the developer's .env holds live keys.
    BUNNY_STREAM_LIBRARY_ID: '',
    BUNNY_STREAM_API_KEY: '',
    BUNNY_STREAM_TOKEN_KEY: '',
    BUNNY_CDN_HOSTNAME: '',
    YOUTUBE_API_KEY: '',
    GOOGLE_OAUTH_WEB_CLIENT_ID: '',
    GOOGLE_OAUTH_ANDROID_CLIENT_ID: '',
    GOOGLE_OAUTH_IOS_CLIENT_ID: '',
    SENTRY_DSN_API: '',
    // A whole browser suite runs from one IP (127.0.0.1); real students and staff each have their own.
    RATE_LIMIT_DEFAULT_PER_MINUTE: '5000',
    E2E_ADMIN_EMAIL,
    E2E_EDITOR_EMAIL,
    E2E_EDITOR2_EMAIL,
    E2E_ADMIN_PASSWORD,
    ...gatewayEnv(apiPort, webOrigin),
  };
}

/**
 * Payment gateways for an E2E run: a local stand-in (fake-gateway.mjs) by default, so runs never touch real gateways.
 * E2E_REAL_GATEWAYS=1 keeps the developer's .env gateway values instead — test (sandbox) credentials only.
 */
function gatewayEnv(apiPort, webOrigin) {
  const urls = { callbackBase: webOrigin, webReturnUrl: `${webOrigin}/payment-result` };
  if (process.env.E2E_REAL_GATEWAYS === '1') {
    if (process.env.ESEWA_ENV === 'production' || process.env.KHALTI_ENV === 'production') {
      throw new Error('E2E_REAL_GATEWAYS is for test (sandbox) credentials only');
    }
    return {
      PAYMENT_CALLBACK_BASE_URL: urls.callbackBase,
      PAYMENT_RETURN_URL_WEB: urls.webReturnUrl,
      E2E_GATEWAY_PORT: '',
    };
  }
  return fakeGatewayEnv(apiPort + 1, urls);
}
