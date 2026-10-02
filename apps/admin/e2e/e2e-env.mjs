// Shared environment for the browser E2E run (API server + seeding). Test-only values.
import { config } from 'dotenv';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../../.env'), quiet: true });

const base = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (!base) throw new Error('Set E2E_DATABASE_URL or TEST_DATABASE_URL');
const dbUrl = new URL(base);
if (!dbUrl.pathname.endsWith('_e2e')) dbUrl.pathname = `${dbUrl.pathname.replace(/_test$/, '')}_e2e`;

const secret = () => randomBytes(48).toString('base64url');
const redisBase = (process.env.REDIS_URL ?? 'redis://localhost:6379').replace(/\/\d+$/, '');

export const E2E_ADMIN_EMAIL = 'e2e-admin@example.test';
export const E2E_ADMIN_PASSWORD = 'e2e only password';

export const e2eEnv = {
  ...process.env,
  NODE_ENV: 'test',
  APP_ENV: 'test',
  LOG_LEVEL: 'warn',
  PORT: '4010',
  DATABASE_URL: dbUrl.toString(),
  REDIS_URL: `${redisBase}/14`,
  EMAIL_PROVIDER: 'log',
  SMS_PROVIDER: 'log',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5174',
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
  PUBLIC_MEDIA_BASE_URL: 'http://localhost:5174/api/v1/public-media',
  PUBLIC_MEDIA_PROXY: 'true',
  STORAGE_AUTO_CREATE_BUCKETS: 'true',
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
};

export const apiDir = path.resolve(here, '../../api');
