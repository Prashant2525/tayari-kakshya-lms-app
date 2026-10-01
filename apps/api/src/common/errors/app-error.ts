import { ErrorCode } from '@tk/contracts';

/** Domain error with a stable code. Thrown anywhere; rendered by HttpExceptionFilter. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  validation: (details: unknown) =>
    new AppError(400, ErrorCode.VALIDATION_FAILED, 'Request validation failed', details),
  unauthenticated: (message = 'Authentication required') =>
    new AppError(401, ErrorCode.UNAUTHENTICATED, message),
  forbidden: (message = 'You do not have permission to do this') =>
    new AppError(403, ErrorCode.FORBIDDEN, message),
  notFound: (what = 'Resource') => new AppError(404, ErrorCode.NOT_FOUND, `${what} not found`),
  conflict: (code: ErrorCode, message: string, details?: unknown) =>
    new AppError(409, code, message, details),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError(
      429,
      ErrorCode.RATE_LIMITED,
      'Too many requests, please try again later',
      { retryAfterSeconds },
      { 'Retry-After': String(retryAfterSeconds) },
    ),
};
