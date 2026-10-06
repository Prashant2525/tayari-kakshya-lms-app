/**
 * Course certificates (D-049, D-050): when one is earned, and the public verification code.
 */

/** Crockford base32: no I, L, O or U, so codes read aloud or typed by hand are unambiguous. */
export const CERTIFICATE_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CERTIFICATE_CODE_LENGTH = 12;

export interface LessonProgress {
  completed: number;
  total: number;
}

/** Earned once the finished share of the course's lessons reaches the template's percentage (an empty course never). */
export function certificateEarned(progress: LessonProgress, requiredPercent: number): boolean {
  return progress.total > 0 && progress.completed * 100 >= requiredPercent * progress.total;
}

/** A 12-character code (60 bits) from at least 8 random bytes. */
export function certificateCodeFromBytes(bytes: Uint8Array): string {
  if (bytes.length < 8) throw new RangeError('Need at least 8 random bytes');
  let value = 0n;
  for (const b of bytes.subarray(0, 8)) value = (value << 8n) | BigInt(b);
  let code = '';
  for (let i = 0; i < CERTIFICATE_CODE_LENGTH; i += 1) {
    code += CERTIFICATE_CODE_ALPHABET[Number(value & 31n)];
    value >>= 5n;
  }
  return code;
}

/** Shown and printed in groups of four: `7K3M-Q9TX-2B4F`. */
export function formatCertificateCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

/**
 * What someone typed or scanned → the stored code, or null when it cannot be one. Case, spaces and dashes do not
 * matter, and the letters people confuse with digits are read as those digits (O → 0, I/L → 1).
 */
export function normalizeCertificateCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (code.length !== CERTIFICATE_CODE_LENGTH) return null;
  for (const ch of code) if (!CERTIFICATE_CODE_ALPHABET.includes(ch)) return null;
  return code;
}
