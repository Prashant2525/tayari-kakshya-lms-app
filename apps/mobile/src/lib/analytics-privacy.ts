/** Pure helpers for `analytics.ts` (no React Native imports, so they are unit-tested). */

/** Properties the SDK may add that can carry addresses or ids (deep links, web URLs, referrers). */
const DROPPED = ['url', '$current_url', '$referrer', '$referring_domain', '$pathname', '$host', '$ip'];

interface OutgoingEvent {
  event: string;
  properties?: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
}

/** PostHog `before_send`: removes URL-like properties and any person properties before an event leaves the app. */
export function scrubAnalyticsEvent<E extends OutgoingEvent>(event: E | null): E | null {
  if (!event) return event;
  const properties = { ...event.properties };
  for (const name of DROPPED) delete properties[name];
  const { $set: _set, $set_once: _setOnce, ...rest } = event;
  return { ...rest, properties } as E;
}

/** The route pattern of the current screen, e.g. `/learn/[itemId]` (groups like `(tabs)` removed). */
export function screenName(segments: readonly string[]): string {
  const path = segments.filter((s) => !(s.startsWith('(') && s.endsWith(')'))).join('/');
  return `/${path}`;
}
