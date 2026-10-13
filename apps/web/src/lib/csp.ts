/**
 * The website's Content-Security-Policy (SECURITY_REVIEW R-3): scripts only with this request's nonce — Next.js puts
 * it on its own scripts, 'strict-dynamic' lets those load the rest — so an injected script cannot run. Styles stay
 * allowed inline (React writes style attributes); pictures may come from the media domain and video sites (https).
 * Forms post only to this site or to the API (the checkout goes on to the gateways from there).
 */
export function contentSecurityPolicy(opts: {
  nonce: string;
  apiOrigin: string | null;
  https: boolean;
  development: boolean;
}): string {
  return [
    "default-src 'self'",
    // Development only: React's fast refresh evaluates code.
    `script-src 'self' 'nonce-${opts.nonce}' 'strict-dynamic'${opts.development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // Local plain-http runs serve pictures over http too; an https site only loads https ones.
    `img-src 'self' data: blob: https:${opts.https ? '' : ' http:'}`,
    "font-src 'self' data:",
    `connect-src 'self'${opts.development ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self'${opts.apiOrigin ? ` ${opts.apiOrigin}` : ''}`,
    "frame-ancestors 'none'",
    ...(opts.https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

/** A fresh value for every page request. */
export function newNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}
