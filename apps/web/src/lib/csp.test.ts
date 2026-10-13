import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, newNonce } from './csp';

describe('website Content-Security-Policy (R-3)', () => {
  it('lets only scripts with this request’s nonce run in production', () => {
    const csp = contentSecurityPolicy({
      nonce: 'abc',
      apiOrigin: 'https://api.example.com',
      https: true,
      development: false,
    });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("form-action 'self' https://api.example.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(csp).toContain("img-src 'self' data: blob: https:;");
  });

  it('allows fast refresh in development and never upgrades plain-http local addresses', () => {
    const csp = contentSecurityPolicy({ nonce: 'n', apiOrigin: null, https: false, development: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(csp).toContain("img-src 'self' data: blob: https: http:");
  });

  it('makes a different nonce every time', () => {
    expect(newNonce()).not.toBe(newNonce());
  });
});
