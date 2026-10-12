import { z } from 'zod';

/**
 * Stable machine-readable error codes. Clients branch on `code`, never on `message`.
 * Adding a code is non-breaking; renaming or removing one is breaking.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  MAINTENANCE_MODE: 'MAINTENANCE_MODE',

  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  PHONE_ALREADY_REGISTERED: 'PHONE_ALREADY_REGISTERED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_DELETED: 'ACCOUNT_DELETED',
  DEVICE_LIMIT_REACHED: 'DEVICE_LIMIT_REACHED',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  PASSWORD_NOT_SET: 'PASSWORD_NOT_SET',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_TOO_MANY_ATTEMPTS: 'OTP_TOO_MANY_ATTEMPTS',
  OTP_RESEND_TOO_SOON: 'OTP_RESEND_TOO_SOON',
  VERIFICATION_CHANNEL_DISABLED: 'VERIFICATION_CHANNEL_DISABLED',
  PHONE_REQUIRED: 'PHONE_REQUIRED',
  GOOGLE_NOT_CONFIGURED: 'GOOGLE_NOT_CONFIGURED',
  GOOGLE_TOKEN_INVALID: 'GOOGLE_TOKEN_INVALID',
  SUPER_ADMIN_PROTECTED: 'SUPER_ADMIN_PROTECTED',
  MFA_INVALID: 'MFA_INVALID',
  MFA_SETUP_REQUIRED: 'MFA_SETUP_REQUIRED',
  MFA_ALREADY_ENABLED: 'MFA_ALREADY_ENABLED',
  MFA_NOT_ENABLED: 'MFA_NOT_ENABLED',
  VIDEO_PROVIDER_NOT_CONFIGURED: 'VIDEO_PROVIDER_NOT_CONFIGURED',
  CONTENT_LOCKED: 'CONTENT_LOCKED',
  VERIFICATION_REQUIRED: 'VERIFICATION_REQUIRED',
  ENROLMENT_NOT_AVAILABLE: 'ENROLMENT_NOT_AVAILABLE',
  /** details.reason: not_open | closed | no_attempts_left | not_ready */
  ASSESSMENT_NOT_AVAILABLE: 'ASSESSMENT_NOT_AVAILABLE',
  /** The attempt is finished (submitted, or its time is over) and cannot change. */
  ATTEMPT_CLOSED: 'ATTEMPT_CLOSED',
  /** The certificate was revoked by staff; it no longer verifies and its PDF is not served. */
  CERTIFICATE_REVOKED: 'CERTIFICATE_REVOKED',
  /** details.reason: channel_closed | already_has_access | free_course | not_for_sale | access_period_ended */
  PURCHASE_NOT_AVAILABLE: 'PURCHASE_NOT_AVAILABLE',
  /**
   * details.reason: not_found | inactive | not_started | ended | used_up | already_used | not_applicable |
   * below_minimum | on_sale
   */
  COUPON_NOT_VALID: 'COUPON_NOT_VALID',
  /** A referral code given at sign-up does not exist (D-058). */
  REFERRAL_CODE_NOT_VALID: 'REFERRAL_CODE_NOT_VALID',
  /** The order is paid, or can no longer be paid (time ran out). */
  ORDER_CLOSED: 'ORDER_CLOSED',
  /** The chosen gateway is switched off or not configured. */
  PAYMENT_PROVIDER_UNAVAILABLE: 'PAYMENT_PROVIDER_UNAVAILABLE',
  /** The gateway could not be reached or refused to start the payment; trying again may work. */
  PAYMENT_GATEWAY_ERROR: 'PAYMENT_GATEWAY_ERROR',
  /** A course is reviewed after finishing part of it (details.requiredPercent, details.progressPercent; D-066). */
  REVIEW_NOT_ALLOWED: 'REVIEW_NOT_ALLOWED',
  /** A live class cannot be joined now (details.opensAt; D-072): not open yet, ended or cancelled. */
  LIVE_CLASS_CLOSED: 'LIVE_CLASS_CLOSED',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ApiErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
