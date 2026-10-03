/** Pure helper for `monitoring.ts` (no React Native imports, so it is unit-tested). */

interface ErrorEventLike {
  user?: unknown;
  breadcrumbs?: unknown;
  extra?: unknown;
  request?: { url?: string };
  contexts?: Record<string, unknown>;
}

/**
 * Removes personal data from a crash report before it leaves the device: the user, breadcrumbs, extra data and
 * request details; a page URL (web build) keeps its path only. Device, OS and app version stay (needed to fix crashes).
 */
export function scrubErrorEvent<E extends ErrorEventLike>(event: E): E {
  const { user: _user, breadcrumbs: _breadcrumbs, extra: _extra, request, ...rest } = event;
  const path = request?.url ? pathOf(request.url) : undefined;
  return { ...rest, ...(path ? { request: { url: path } } : {}) } as E;
}

function pathOf(url: string): string | undefined {
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}
