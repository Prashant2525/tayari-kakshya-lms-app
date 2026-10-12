import { describe, expect, it } from 'vitest';
import { redactUrl } from './log-redaction.js';

describe('redactUrl (Phase 15)', () => {
  it('hides signed links, gateway payloads and tokens but keeps the rest', () => {
    expect(redactUrl('/api/v1/receipts/abc/pdf?exp=1760000000&sig=s3cr3t')).toBe(
      '/api/v1/receipts/abc/pdf?exp=1760000000&sig=[redacted]',
    );
    expect(redactUrl('/api/v1/payments/esewa/return?payment=p1&data=eyJzaWdu')).toBe(
      '/api/v1/payments/esewa/return?payment=p1&data=[redacted]',
    );
    expect(redactUrl('/api/v1/payments/khalti/return?pidx=XyZ&status=Completed')).toBe(
      '/api/v1/payments/khalti/return?pidx=[redacted]&status=Completed',
    );
    expect(redactUrl('/x?Token=a&%73ig=b')).toBe('/x?Token=[redacted]&%73ig=[redacted]');
  });

  it('leaves URLs without secrets alone', () => {
    expect(redactUrl('/api/v1/courses?limit=20&cursor=abc')).toBe('/api/v1/courses?limit=20&cursor=abc');
    expect(redactUrl('/api/v1/health/ready')).toBe('/api/v1/health/ready');
    expect(redactUrl('/x?%E0%A4=1')).toBe('/x?%E0%A4=1');
  });
});
