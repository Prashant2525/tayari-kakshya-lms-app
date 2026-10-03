import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from './bootstrap.js';

const list = ['https://admin.example.com'];

describe('CORS origins', () => {
  it('allows the configured origins in every environment', () => {
    for (const APP_ENV of ['development', 'test', 'staging', 'production'] as const) {
      expect(isAllowedOrigin('https://admin.example.com', { APP_ENV, CORS_ALLOWED_ORIGINS: list })).toBe(
        true,
      );
    }
  });

  it('allows any localhost port only on a developer machine', () => {
    const dev = { APP_ENV: 'development' as const, CORS_ALLOWED_ORIGINS: list };
    expect(isAllowedOrigin('http://localhost:8081', dev)).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:5173', dev)).toBe(true);
    for (const APP_ENV of ['test', 'staging', 'production'] as const) {
      expect(isAllowedOrigin('http://localhost:8081', { APP_ENV, CORS_ALLOWED_ORIGINS: list })).toBe(false);
    }
  });

  it('never allows look-alike or remote origins through the development rule', () => {
    const dev = { APP_ENV: 'development' as const, CORS_ALLOWED_ORIGINS: list };
    expect(isAllowedOrigin('http://localhost.evil.com:8081', dev)).toBe(false);
    expect(isAllowedOrigin('http://192.168.1.20:8081', dev)).toBe(false);
    expect(isAllowedOrigin('https://localhost:8081', dev)).toBe(false);
    expect(isAllowedOrigin('http://localhost:8081.evil.com', dev)).toBe(false);
  });
});
