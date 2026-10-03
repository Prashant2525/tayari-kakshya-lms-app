import * as Sentry from '@sentry/react-native';
import { scrubErrorEvent } from './monitoring-privacy';

/**
 * Crash and error reporting (D-039, T-042). Off unless EXPO_PUBLIC_SENTRY_DSN is set at build time. Expo Go reports
 * JavaScript errors only; native crashes need a development or store build (config plugin in app.config.ts).
 *
 * Privacy: no personal data (`sendDefaultPii: false`, no user), no breadcrumbs (they would carry tapped labels,
 * console output and request URLs with ids or search text), no screenshots or view hierarchy (screens show
 * personal and Premium content), no session replay, no tracing; `scrubErrorEvent` removes anything left over.
 */
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN || undefined;

export function initMonitoring(): boolean {
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : process.env.EXPO_PUBLIC_APP_ENV || 'production',
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableCaptureFailedRequests: false,
    enableUserInteractionTracing: false,
    enableAppStartTracking: false,
    enableNativeFramesTracking: false,
    enableStallTracking: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null,
    beforeSend: (event) => scrubErrorEvent(event),
    initialScope: { tags: { service: 'app' } },
  });
  return true;
}
