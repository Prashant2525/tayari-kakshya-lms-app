import type { ErrorEvent } from '@sentry/react';
import { ApiError } from './api';

/**
 * Error monitoring for the Admin CMS (D-039, T-042). Off unless VITE_SENTRY_DSN is set at build time.
 *
 * Staff screens show students' personal data, so nothing from the page goes to Sentry: Sentry 11's data collection
 * is switched off, there are no breadcrumbs (they would carry clicked text, console output and request URLs), no
 * session replay and no tracing, and `scrubEvent` keeps only the page path. API failures are not reported here — the
 * API reports its own errors.
 *
 * The Sentry library is loaded only when a DSN is set, after the page has started (KI-018: it is ~90 KB the CMS
 * does not need to show its first screen). Errors caught before it has loaded are reported once it has.
 */
type SentryClient = typeof import('./sentry-client');
let sentry: Promise<SentryClient> | null = null;

export function initMonitoring(dsn = import.meta.env.VITE_SENTRY_DSN): boolean {
  if (!dsn) return false;
  if (sentry) return true;
  // Errors that happen while Sentry is still loading are kept and reported once it has started.
  const early: unknown[] = [];
  const onError = (e: globalThis.ErrorEvent | PromiseRejectionEvent) =>
    early.push('reason' in e ? e.reason : (e.error ?? e.message));
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onError);
  sentry = import('./sentry-client').then((client) => {
    client.start(dsn, scrubEvent);
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onError);
    for (const error of early) client.captureException(error);
    return client;
  });
  return true;
}

/** Reports an unexpected error caught by an error screen (API errors are reported by the API itself). */
export function reportError(error: unknown): void {
  if (!sentry || error instanceof ApiError) return;
  void sentry.then((client) => client.captureException(error)).catch(() => undefined);
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
