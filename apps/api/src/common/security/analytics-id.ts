import { createHmac, hkdfSync } from 'node:crypto';

/**
 * Pseudonymous id for product analytics (ARCHITECTURE: "user id hashed"; D-039). PostHog only ever sees this value,
 * never the account id, name, email or phone. It is stable per account, and without the server key it cannot be
 * turned back into an account id. The key is derived from ENCRYPTION_KEY for this purpose only (HKDF), so it never
 * reuses the encryption key itself.
 */
export function analyticsIdFor(userId: string, encryptionKey: string): string {
  const key = Buffer.from(hkdfSync('sha256', encryptionKey, '', 'tk analytics id v1', 32));
  return createHmac('sha256', key).update(userId).digest('base64url');
}
