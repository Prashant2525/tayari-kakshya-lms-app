import { describe, expect, it } from 'vitest';
import { screenName, scrubAnalyticsEvent } from './analytics-privacy';

describe('analytics privacy', () => {
  it('names screens by route pattern, without route groups', () => {
    expect(screenName(['(tabs)'])).toBe('/');
    expect(screenName(['(learn)', 'learn', '[itemId]'])).toBe('/learn/[itemId]');
    expect(screenName(['(learn)', 'subject', '[courseId]', '[subjectId]'])).toBe(
      '/subject/[courseId]/[subjectId]',
    );
  });

  it('removes URLs, referrers and person properties before sending', () => {
    const out = scrubAnalyticsEvent({
      event: 'Application Opened',
      properties: {
        url: 'tayarikakshya://learn/0192a3b4?token=x',
        $current_url: 'https://app.example.com/learn/1',
        $referrer: 'https://example.com',
        $screen_name: '/learn/[itemId]',
        $os_name: 'Android',
      },
      $set: { email: 'student@example.com' },
      $set_once: { name: 'Sita' },
    });
    expect(out).toEqual({
      event: 'Application Opened',
      properties: { $screen_name: '/learn/[itemId]', $os_name: 'Android' },
    });
    expect(scrubAnalyticsEvent(null)).toBeNull();
  });
});
