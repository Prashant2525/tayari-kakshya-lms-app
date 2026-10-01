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
  LOG_LEVEL: 'silent',
  DATABASE_URL: testDb,
  REDIS_URL: `${redisBase}/15`,
  EMAIL_PROVIDER: 'log',
  SMS_PROVIDER: 'log',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
  JWT_ACCESS_SECRET: process.env['JWT_ACCESS_SECRET'] ?? secret(),
  REFRESH_TOKEN_PEPPER: process.env['REFRESH_TOKEN_PEPPER'] ?? secret(),
  OTP_PEPPER: process.env['OTP_PEPPER'] ?? secret(),
});
