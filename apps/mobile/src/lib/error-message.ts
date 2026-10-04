import type { MessageKey } from '@/i18n/en';
import { ApiError, NETWORK_ERROR } from './api-client';

/** Students see a translated sentence for known error codes, never the server's English text. */
const BY_CODE: Record<string, MessageKey> = {
  [NETWORK_ERROR]: 'error.network',
  INVALID_CREDENTIALS: 'error.invalidCredentials',
  EMAIL_ALREADY_REGISTERED: 'error.emailTaken',
  PHONE_ALREADY_REGISTERED: 'error.phoneTaken',
  ACCOUNT_SUSPENDED: 'error.suspended',
  ACCOUNT_DELETED: 'error.deleted',
  RATE_LIMITED: 'error.rateLimited',
  OTP_INVALID: 'error.otpInvalid',
  OTP_EXPIRED: 'error.otpExpired',
  OTP_TOO_MANY_ATTEMPTS: 'error.otpTooMany',
  OTP_RESEND_TOO_SOON: 'error.otpTooSoon',
  VERIFICATION_CHANNEL_DISABLED: 'error.channelDisabled',
  GOOGLE_NOT_CONFIGURED: 'error.googleUnavailable',
  GOOGLE_TOKEN_INVALID: 'error.googleFailed',
  REFRESH_TOKEN_INVALID: 'error.sessionExpired',
  REFRESH_TOKEN_REUSED: 'error.sessionExpired',
  MAINTENANCE_MODE: 'error.maintenance',
  VALIDATION_FAILED: 'error.fixFields',
  ASSESSMENT_NOT_AVAILABLE: 'error.assessmentNotAvailable',
  ATTEMPT_CLOSED: 'error.attemptClosed',
  CONTENT_LOCKED: 'error.contentLocked',
};

export function errorMessageKey(error: unknown): MessageKey {
  if (error instanceof ApiError) return BY_CODE[error.code] ?? 'error.generic';
  return 'error.generic';
}
