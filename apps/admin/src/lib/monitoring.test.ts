import { describe, expect, it } from 'vitest';
import { initMonitoring, scrubEvent } from './monitoring';

describe('admin error monitoring', () => {
  it('stays off without a DSN', () => {
    expect(initMonitoring('')).toBe(false);
  });

  it('keeps only the page path and browser of an event', () => {
    window.history.pushState({}, '', '/students/abc?q=sita@example.com#notes');
    const event = scrubEvent({
      type: undefined,
      user: { id: 'u1', email: 'staff@example.com' },
      breadcrumbs: [{ message: 'click: Sita Thapa' }],
      extra: { form: { password: 'secret' } },
      request: { url: 'https://cms.example.com/students/abc?q=sita@example.com', cookies: { sid: 'x' } },
    });
    expect(event.user).toBeUndefined();
    expect(event.breadcrumbs).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.request).toEqual({ url: '/students/abc', headers: { 'User-Agent': navigator.userAgent } });
  });
});
