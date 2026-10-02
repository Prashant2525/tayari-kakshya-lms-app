import { config } from 'dotenv';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Test environment: the dedicated test database, Redis logical DB 15, in-memory mail/SMS, silent logs.
 * Works locally (root .env) and in CI (variables provided by the workflow).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../../.env'), quiet: true });

const testDb = process.env['TEST_DATABASE_URL'];
if (!testDb) throw new Error('TEST_DATABASE_URL must be set for API tests');

const redisBase = (process.env['REDIS_URL'] ?? 'redis://localhost:6379').replace(/\/\d+$/, '');
const secret = () => randomBytes(48).toString('base64url');

Object.assign(process.env, {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  LOG_LEVEL: process.env['TEST_LOG_LEVEL'] ?? 'silent',
  DATABASE_URL: testDb,
  REDIS_URL: `${redisBase}/15`,
  EMAIL_PROVIDER: 'log',
  SMS_PROVIDER: 'log',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
  JWT_ACCESS_SECRET: process.env['JWT_ACCESS_SECRET'] ?? secret(),
  REFRESH_TOKEN_PEPPER: process.env['REFRESH_TOKEN_PEPPER'] ?? secret(),
  OTP_PEPPER: process.env['OTP_PEPPER'] ?? secret(),
  ENCRYPTION_KEY: process.env['ENCRYPTION_KEY'] ?? secret(),
  // Object storage: local SeaweedFS (CI starts one too) with test-only buckets.
  S3_ENDPOINT: process.env['S3_ENDPOINT'] ?? 'http://localhost:8333',
  S3_REGION: process.env['S3_REGION'] ?? 'us-east-1',
  S3_ACCESS_KEY_ID: process.env['S3_ACCESS_KEY_ID'] ?? 'tayari_dev_access',
  S3_SECRET_ACCESS_KEY: process.env['S3_SECRET_ACCESS_KEY'] ?? 'tayari_dev_secret_only',
  S3_FORCE_PATH_STYLE: 'true',
  S3_BUCKET_PUBLIC: 'tayari-test-public',
  S3_BUCKET_PRIVATE: 'tayari-test-private',
  PUBLIC_MEDIA_BASE_URL: 'http://localhost/api/v1/public-media',
  PUBLIC_MEDIA_PROXY: 'true',
  STORAGE_AUTO_CREATE_BUCKETS: 'true',
  // Never call real video providers from tests, even when the developer's .env holds live keys.
  BUNNY_STREAM_LIBRARY_ID: '',
  BUNNY_STREAM_API_KEY: '',
  BUNNY_STREAM_TOKEN_KEY: '',
  BUNNY_CDN_HOSTNAME: '',
  YOUTUBE_API_KEY: '',
});
