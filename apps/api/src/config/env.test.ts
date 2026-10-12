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
