import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';
import type { Env } from '../../config/env.js';

/**
 * Error monitoring (D-039, ARCHITECTURE §Observability). Off unless `SENTRY_DSN_API` is set, so tests, CI and local
 * runs without a DSN send nothing. Only unexpected errors are reported; deliberate `AppError`s and 4xx are not.
 *
 * Privacy: data collection is switched off (`dataCollection`, no request integration), and `scrubEvent` removes
 * bodies, headers other than a few client hints, cookies, query strings, IP addresses and user details from anything
 * that still gets through. Request ids link an event to our own logs.
 */
let enabled = false;

const SAFE_HEADERS = new Set([
  'user-agent',
  'content-type',
  'x-tk-client',
  'x-tk-platform',
  'x-tk-app-version',
]);

export function initMonitoring(env: Env, service: 'api' | 'worker'): boolean {
  if (!env.SENTRY_DSN_API || enabled) return enabled;
  Sentry.init({
    dsn: env.SENTRY_DSN_API,
    environment: env.APP_ENV,
    release: env.APP_RELEASE,
    serverName: service,
    // Sentry 11 collects all of these by default; none may leave the server (passwords are in request bodies and
    // local variables). Request headers are limited to client hints.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: [...SAFE_HEADERS] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
    // Errors only: performance tracing is not part of the approved scope.
    tracesSampleRate: 0,
    enableOpenTelemetrySetup: false,
    defaultIntegrations: false,
    integrations: [
      Sentry.eventFiltersIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.nodeContextIntegration(),
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
    ],
    initialScope: { tags: { service } },
    beforeSend: scrubEvent,
    beforeBreadcrumb: () => null,
  });
  enabled = true;
  return true;
}

/** Reports an unexpected error with ids that let us find it in our logs (never request bodies or URLs with ids). */
export function reportError(
  error: unknown,
  context: { requestId?: string; route?: string; job?: string } = {},
): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context.requestId) scope.setTag('request_id', context.requestId);
    if (context.route) scope.setTag('route', context.route);
    if (context.job) scope.setTag('job', context.job);
    Sentry.captureException(error);
  });
}

/** Sends pending events before the process exits. */
export async function flushMonitoring(timeoutMs = 2000): Promise<void> {
  if (enabled) await Sentry.close(timeoutMs);
}

/** Removes personal data from an event before it leaves the server (defence in depth; see the module comment). */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  delete event.breadcrumbs;
  if (event.request) {
    const headers = Object.fromEntries(
      Object.entries(event.request.headers ?? {}).filter(([name]) => SAFE_HEADERS.has(name.toLowerCase())),
    );
    event.request = {
      method: event.request.method,
      url: event.request.url?.split('?')[0],
      headers,
    };
  }
  return event;
}
