import * as Sentry from '@sentry/react';
import type { ErrorEvent } from '@sentry/react';
import { ApiError } from './api';

/**
 * Error monitoring for the Admin CMS (D-039, T-042). Off unless VITE_SENTRY_DSN is set at build time.
 *
 * Staff screens show students' personal data, so nothing from the page goes to Sentry: Sentry 11's data collection
 * is switched off, there are no breadcrumbs (they would carry clicked text, console output and request URLs), no
 * session replay and no tracing, and `scrubEvent` keeps only the page path. API failures are not reported here — the
 * API reports its own errors.
 */
let enabled = false;

export function initMonitoring(dsn = import.meta.env.VITE_SENTRY_DSN): boolean {
  if (!dsn || enabled) return enabled;
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_APP_ENV || (import.meta.env.DEV ? 'development' : 'production'),
    release: import.meta.env.VITE_APP_RELEASE || undefined,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
    tracesSampleRate: 0,
    defaultIntegrations: false,
    integrations: [
      Sentry.eventFiltersIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.browserApiErrorsIntegration(),
      Sentry.globalHandlersIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
    ],
    initialScope: { tags: { service: 'admin' } },
    beforeSend: scrubEvent,
    beforeBreadcrumb: () => null,
  });
  enabled = true;
  return true;
}

/** Reports an unexpected error caught by an error screen (API errors are reported by the API itself). */
export function reportError(error: unknown): void {
  if (!enabled || error instanceof ApiError) return;
  Sentry.captureException(error);
}

/** Keeps the error, the page path (no query string or fragment) and the browser; removes everything else. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  delete event.breadcrumbs;
  delete event.extra;
  const path = typeof location === 'undefined' ? undefined : location.pathname;
  event.request = { url: path, headers: { 'User-Agent': navigator.userAgent } };
  return event;
}
