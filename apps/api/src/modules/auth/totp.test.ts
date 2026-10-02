import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hotp, otpauthUrl, timeStep, verifyTotp } from './totp.js';

// RFC 6238 Appendix B (SHA-1 secret "12345678901234567890"), truncated to 6 digits.
const RFC_SECRET = Buffer.from('12345678901234567890');
const RFC_VECTORS: Array<[number, string]> = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
];

describe('TOTP (RFC 6238)', () => {
  it.each(RFC_VECTORS)('matches the RFC test vector at t=%i', (seconds, expected) => {
    expect(hotp(RFC_SECRET, timeStep(seconds * 1000))).toBe(expected);
  });

  it('round-trips base32', () => {
    const encoded = base32Encode(RFC_SECRET);
    expect(encoded).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(encoded).equals(RFC_SECRET)).toBe(true);
  });

  it('accepts codes within ±1 step and rejects others', () => {
    const secret = base32Encode(RFC_SECRET);
    const now = 1234567890 * 1000;
    const step = timeStep(now);
    const key = base32Decode(secret);
    expect(verifyTotp(secret, hotp(key, step), now)).toBe(step);
    expect(verifyTotp(secret, hotp(key, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, hotp(key, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(secret, hotp(key, step - 2), now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
  });

  it('builds an otpauth URL for authenticator apps', () => {
    const url = otpauthUrl({ secret: 'ABC', account: 'admin@example.com', issuer: 'Tayari Kakshya' });
    expect(url).toMatch(/^otpauth:\/\/totp\/Tayari%20Kakshya%3Aadmin%40example\.com\?/);
    expect(url).toContain('secret=ABC');
    expect(url).toContain('issuer=Tayari+Kakshya');
  });
});
