// Loaded on demand by monitoring.ts when VITE_SENTRY_DSN is set (KI-018). Only the functions named here are bundled.
import {
  browserApiErrorsIntegration,
  dedupeIntegration,
  eventFiltersIntegration,
  functionToStringIntegration,
  globalHandlersIntegration,
  init,
  linkedErrorsIntegration,
  type ErrorEvent,
} from '@sentry/react';

export { captureException } from '@sentry/react';

export function start(dsn: string, scrubEvent: (event: ErrorEvent) => ErrorEvent): void {
  init({
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
      eventFiltersIntegration(),
      functionToStringIntegration(),
      browserApiErrorsIntegration(),
      globalHandlersIntegration(),
      linkedErrorsIntegration(),
      dedupeIntegration(),
    ],
    initialScope: { tags: { service: 'admin' } },
    beforeSend: scrubEvent,
    beforeBreadcrumb: () => null,
  });
}
