import type { Params } from 'nestjs-pino';
import type { Env } from '../../config/env.js';
import { redactUrl } from '../security/log-redaction.js';

/**
 * One logging setup for the API and the worker (KI-015): JSON lines in staging / production (pretty in development),
 * tagged with the service, without secrets — authorization, cookies and secret URL parameters are removed (Phase 15).
 */
export function pinoParams(env: Env, service: 'api' | 'worker'): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: (req) => String(req.headers['x-request-id'] ?? ''),
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        remove: true,
      },
      // Signed receipt links, gateway payloads and the like stay out of the logs (Phase 15).
      serializers: {
        req: (req: { url?: string }) => (req.url ? { ...req, url: redactUrl(req.url) } : req),
      },
      // Every line, request or not, says which process wrote it.
      mixin: () => ({ service }),
      transport:
        env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
    },
  };
}
