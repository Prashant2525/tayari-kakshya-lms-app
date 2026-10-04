import { describe, expect, it } from 'vitest';
import { scrubErrorEvent } from './monitoring-privacy';

describe('crash report privacy', () => {
  it('drops the user, breadcrumbs, extra data and request details; keeps device context', () => {
    const out = scrubErrorEvent({
      message: 'boom',
      user: { id: 'u1', email: 'student@example.com' },
      breadcrumbs: [{ message: 'touch: Sita Thapa' }],
      extra: { password: 'secret' },
      request: { url: 'http://localhost:8081/learn/abc?token=x', headers: { Cookie: 'sid=1' } },
      contexts: { os: { name: 'Android' } },
    });
    expect(out).toEqual({
      message: 'boom',
      request: { url: '/learn/abc' },
      contexts: { os: { name: 'Android' } },
    });
  });

  it('drops a request it cannot parse', () => {
    expect(scrubErrorEvent({ message: 'x', request: { url: 'not a url' } })).toEqual({ message: 'x' });
  });
});
