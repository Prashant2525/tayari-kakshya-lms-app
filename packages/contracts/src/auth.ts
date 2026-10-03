import { z } from 'zod';
import { Locale, PhoneE164, Platform } from './common.js';

/**
 * Password policy (technical security default, NIST SP 800-63B style): length-based, no composition rules.
 */
export const Password = z.string().min(8, 'Password must be at least 8 characters').max(128);

/** Trimmed and lower-cased before validation, so pasted addresses with spaces/caps are accepted. */
export const Email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const DeviceInfo = z.object({
  /** Stable, client-generated install identifier (not a hardware ID). */
  deviceId: z.string().min(8).max(128),
  deviceName: z.string().trim().min(1).max(120),
  platform: Platform,
});
export type DeviceInfo = z.infer<typeof DeviceInfo>;

export const RegisterInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: Email,
  password: Password,
  locale: Locale.default('en'),
  acceptTerms: z.literal(true, { error: 'Terms must be accepted' }),
  device: DeviceInfo,
});
export type RegisterInput = z.infer<typeof RegisterInput>;

/** When the device limit is reached, the client may retry naming one of its sessions to sign out (D-028). */
const ReplaceSession = { replaceSessionId: z.uuid().optional() };

export const LoginInput = z.object({
  email: Email,
  password: z.string().min(1).max(128),
  device: DeviceInfo,
  ...ReplaceSession,
});
export type LoginInput = z.infer<typeof LoginInput>;

export const GoogleLoginInput = z.object({
  idToken: z.string().min(10).max(4096),
  locale: Locale.default('en'),
  device: DeviceInfo,
  ...ReplaceSession,
});

export const StaffLoginInput = z.object({
  email: Email,
  password: z.string().min(1).max(128),
});
export type StaffLoginInput = z.infer<typeof StaffLoginInput>;
export type GoogleLoginInput = z.infer<typeof GoogleLoginInput>;

export const RefreshInput = z.object({ refreshToken: z.string().min(20).max(512) });
export type RefreshInput = z.infer<typeof RefreshInput>;

export const OtpPurpose = z.enum(['verify_email', 'verify_phone', 'reset_password']);
export type OtpPurpose = z.infer<typeof OtpPurpose>;

/** Technical security parameters (not business rules). Shared so apps show the same resend timer. */
export const OTP_POLICY = {
  ttlMinutes: 10,
  maxAttempts: 5,
  resendCooldownSeconds: 60,
  maxPerHour: 5,
} as const;

export const OtpCode = z.string().regex(/^\d{6}$/, 'Code must be 6 digits');

export const SendVerificationOtpInput = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('email') }),
  z.object({ channel: z.literal('phone'), phone: PhoneE164 }),
]);
export type SendVerificationOtpInput = z.infer<typeof SendVerificationOtpInput>;

export const VerifyOtpInput = z.object({ channel: z.enum(['email', 'phone']), code: OtpCode });
export type VerifyOtpInput = z.infer<typeof VerifyOtpInput>;

export const ForgotPasswordInput = z.object({ email: Email });
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordInput>;

export const ResetPasswordInput = z.object({ email: Email, code: OtpCode, newPassword: Password });
export type ResetPasswordInput = z.infer<typeof ResetPasswordInput>;

export const ChangePasswordInput = z.object({
  /** Optional only for accounts created with Google that have never set a password. */
  currentPassword: z.string().min(1).max(128).optional(),
  newPassword: Password,
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>;

export const AuthTokens = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: z.iso.datetime(),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.iso.datetime(),
  sessionId: z.uuid(),
});
export type AuthTokens = z.infer<typeof AuthTokens>;

export const SessionView = z.object({
  id: z.uuid(),
  deviceName: z.string(),
  platform: Platform,
  lastUsedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  current: z.boolean(),
});
export type SessionView = z.infer<typeof SessionView>;

export const DeviceLimitDetails = z.object({
  maxActiveSessions: z.number().int(),
  sessions: z.array(SessionView.omit({ current: true })),
});
export type DeviceLimitDetails = z.infer<typeof DeviceLimitDetails>;

export const MeView = z.object({
  id: z.uuid(),
  kind: z.enum(['student', 'staff']),
  fullName: z.string(),
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  phone: z.string().nullable(),
  phoneVerified: z.boolean(),
  hasPassword: z.boolean(),
  locale: Locale,
  dob: z.iso.date().nullable(),
  gender: z.string().nullable(),
  educationLevelId: z.uuid().nullable(),
  deletionScheduledFor: z.iso.datetime().nullable(),
  permissions: z.array(z.string()),
  /** Staff only: two-factor status and whether policy forces setup before using the CMS. */
  mfaEnabled: z.boolean(),
  mfaSetupRequired: z.boolean(),
  isSuperAdmin: z.boolean(),
  /** Pseudonymous id for product analytics (never the account id; ARCHITECTURE §Observability). */
  analyticsId: z.string(),
});
export type MeView = z.infer<typeof MeView>;

export const UpdateMeInput = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    locale: Locale,
    /** AD date (YYYY-MM-DD); clients convert from the BS picker. */
    dob: z.iso.date().nullable(),
    gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).nullable(),
    educationLevelId: z.uuid().nullable(),
  })
  .partial()
  .strict();
export type UpdateMeInput = z.infer<typeof UpdateMeInput>;
