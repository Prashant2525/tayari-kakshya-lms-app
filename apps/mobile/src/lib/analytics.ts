import { useSegments } from 'expo-router';
import PostHog from 'posthog-react-native';
import { useEffect, useRef } from 'react';
import { screenName, scrubAnalyticsEvent } from './analytics-privacy';

/**
 * Product analytics (PostHog, D-039). Off unless EXPO_PUBLIC_POSTHOG_KEY is set at build time.
 *
 * Privacy (FEATURE_SPECIFICATION "analytics without PII", ARCHITECTURE §Observability):
 * - students are identified only by `analyticsId`, a pseudonym made by the API — never the account id, name, email
 *   or phone; nothing is attached to the person profile;
 * - screens are recorded by route pattern (`/learn/[itemId]`), never with ids, search text or other parameters;
 * - event properties are limited to the names below and plain values (types, outcomes, counts, content ids);
 * - no session replay, no touch autocapture (it would record on-screen text), no error capture (Sentry's job);
 * - URL-like properties the SDK adds (e.g. the deep link that opened the app) are removed before sending.
 */
const key = process.env.EXPO_PUBLIC_POSTHOG_KEY || undefined;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

const client = key
  ? new PostHog(key, {
      host,
      persistence: 'file',
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      personProfiles: 'identified_only',
      errorTracking: { autocapture: false },
      // Feature flags and surveys are not used: flags live in our own CMS settings (ARCHITECTURE).
      preloadFeatureFlags: false,
      disableRemoteFeatureFlags: true,
      sendFeatureFlagEvent: false,
      disableSurveys: true,
      before_send: scrubAnalyticsEvent,
    })
  : null;

export type AnalyticsEvent =
  | 'signed_up'
  | 'logged_in'
  | 'course_enrolled'
  | 'lesson_opened'
  | 'lesson_completed'
  | 'practice_answer_checked'
  | 'question_reported'
  | 'bookmark_added'
  | 'bookmark_removed'
  | 'search_performed'
  | 'account_deletion_requested';

type Value = string | number | boolean | null;

export function track(event: AnalyticsEvent, properties: Record<string, Value> = {}): void {
  client?.capture(event, properties);
}

/** Records a screen view whenever the route pattern changes (opening another lesson is `lesson_opened`). */
export function useScreenTracking(): void {
  const segments = useSegments();
  const name = screenName(segments);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!client || last.current === name) return;
    last.current = name;
    void client.screen(name);
  }, [name]);
}

/** Links events to the signed-in student's pseudonym, and forgets it on sign-out. */
export function useAnalyticsIdentity(analyticsId: string | undefined, signedIn: boolean): void {
  const current = useRef<string | null>(null);
  useEffect(() => {
    if (!client) return;
    if (analyticsId && current.current !== analyticsId) {
      current.current = analyticsId;
      client.identify(analyticsId);
    } else if (!signedIn && current.current) {
      current.current = null;
      client.reset();
    }
  }, [analyticsId, signedIn]);
}
