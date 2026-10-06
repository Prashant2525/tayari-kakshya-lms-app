import { describe, expect, it } from 'vitest';
import {
  CERTIFICATE_CODE_ALPHABET,
  certificateCodeFromBytes,
  certificateEarned,
  formatCertificateCode,
  normalizeCertificateCode,
} from './certificate.js';

describe('certificate earned (D-049)', () => {
  it('needs the share of lessons, counted exactly', () => {
    expect(certificateEarned({ completed: 8, total: 10 }, 80)).toBe(true);
    expect(certificateEarned({ completed: 7, total: 10 }, 80)).toBe(false);
    expect(certificateEarned({ completed: 2, total: 3 }, 67)).toBe(false); // 66.7 %
    expect(certificateEarned({ completed: 2, total: 3 }, 66)).toBe(true);
    expect(certificateEarned({ completed: 3, total: 3 }, 100)).toBe(true);
  });

  it('is never earned for a course without lessons', () => {
    expect(certificateEarned({ completed: 0, total: 0 }, 1)).toBe(false);
  });
});

describe('certificate code', () => {
  it('turns 8 bytes into 12 unambiguous characters', () => {
    const code = certificateCodeFromBytes(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(code).toHaveLength(12);
    for (const ch of code) expect(CERTIFICATE_CODE_ALPHABET).toContain(ch);
    expect(certificateCodeFromBytes(new Uint8Array(8))).toBe('000000000000');
    expect(certificateCodeFromBytes(new Uint8Array(8).fill(255))).toBe('ZZZZZZZZZZZZ');
    expect(() => certificateCodeFromBytes(new Uint8Array(7))).toThrow(RangeError);
  });

  it('is printed in groups of four and read back however it was typed', () => {
    expect(formatCertificateCode('7K3MQ9TX2B4F')).toBe('7K3M-Q9TX-2B4F');
    expect(normalizeCertificateCode('7k3m-q9tx-2b4f')).toBe('7K3MQ9TX2B4F');
    expect(normalizeCertificateCode(' 7K3M Q9TX 2B4F ')).toBe('7K3MQ9TX2B4F');
    expect(normalizeCertificateCode('OK3M-Q9TX-2BIL')).toBe('0K3MQ9TX2B11');
    expect(normalizeCertificateCode('7K3M-Q9TX-2B4')).toBeNull();
    expect(normalizeCertificateCode('7K3M-Q9TX-2B4U')).toBeNull();
    expect(normalizeCertificateCode('7K3M/Q9TX/2B4F')).toBeNull();
  });
});
