import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const env = (extra: Record<string, string>) => loadEnv({ ...process.env, ...extra });

describe('TRUST_PROXY (Phase 15)', () => {
  it('is off by default and accepts true / false', () => {
    const { TRUST_PROXY: _ignored, ...rest } = process.env;
    expect(loadEnv(rest).TRUST_PROXY).toBe(false);
    expect(env({ TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
    expect(env({ TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
  });

  it('accepts the proxies’ addresses and CIDR ranges', () => {
    expect(env({ TRUST_PROXY: '127.0.0.1, 10.0.0.0/8,::1' }).TRUST_PROXY).toEqual([
      '127.0.0.1',
      '10.0.0.0/8',
      '::1',
    ]);
  });

  it('refuses anything else', () => {
    expect(() => env({ TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/);
    expect(() => env({ TRUST_PROXY: 'proxy.internal' })).toThrow(/TRUST_PROXY/);
  });

  it('refuses "trust everyone" in staging and production, where forged addresses would dodge rate limits', () => {
    expect(() => env({ APP_ENV: 'staging', TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
  });
});

describe('half-configured services (D-076, G-3)', () => {
  it('names the missing value instead of silently leaving the service off', () => {
    expect(() => env({ ESEWA_PRODUCT_CODE: 'EPAYTEST', ESEWA_SECRET_KEY: '' })).toThrow(
      /ESEWA_SECRET_KEY: eSewa is half configured: ESEWA_PRODUCT_CODE set but ESEWA_SECRET_KEY empty/,
    );
    expect(() => env({ SMTP_USER: 'apikey', SMTP_PASSWORD: '' })).toThrow(
      /SMTP_PASSWORD: SMTP login is half/,
    );
    expect(() =>
      env({ BUNNY_STREAM_LIBRARY_ID: '', BUNNY_STREAM_API_KEY: 'key', BUNNY_STREAM_TOKEN_KEY: 'token' }),
    ).toThrow(/BUNNY_STREAM_LIBRARY_ID: Bunny Stream is half configured/);
  });

  it('accepts a service fully set or fully empty', () => {
    expect(() => env({ ESEWA_PRODUCT_CODE: '', ESEWA_SECRET_KEY: '' })).not.toThrow();
    expect(() => env({ SMTP_USER: '', SMTP_PASSWORD: '' })).not.toThrow();
    expect(() => env({ SMTP_USER: 'apikey', SMTP_PASSWORD: 'secret' })).not.toThrow();
  });
});

describe('SMS providers (D-076, G-2)', () => {
  it('need the account token, and Sparrow its approved sender', () => {
    expect(() => env({ SMS_PROVIDER: 'aakash', SMS_API_KEY: '' })).toThrow(
      /SMS_API_KEY: required with SMS_PROVIDER=aakash/,
    );
    expect(() => env({ SMS_PROVIDER: 'sparrow', SMS_API_KEY: 't', SMS_SENDER_ID: '' })).toThrow(
      /SMS_SENDER_ID: required with SMS_PROVIDER=sparrow/,
    );
    expect(() =>
      env({ SMS_PROVIDER: 'sparrow', SMS_API_KEY: 't', SMS_SENDER_ID: 'TayariKaksha' }),
    ).not.toThrow();
  });
});
