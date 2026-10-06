import { z } from 'zod';
import { LocalizedText } from './common.js';
import { QuestionType } from './questions.js';

/**
 * Typed registry of CMS-editable system settings. Each key has a schema and a default.
 * Defaults are *technical* starting points, not owner business decisions: values marked
 * "launch checklist" in docs/PROJECT_STATE.md must be set by the owner before go-live.
 */
export const SETTINGS = {
  /** D-028. `maxActiveSessions: null` = no limit enforced yet (launch checklist). */
  'auth.deviceLimit': {
    schema: z.object({
      maxActiveSessions: z.number().int().min(1).max(20).nullable(),
      onLimit: z.enum(['block', 'revoke_oldest']),
    }),
    default: { maxActiveSessions: null, onLimit: 'block' as const },
    public: false,
  },
  /** D-029. Which verification channels students may use; phone needs an SMS provider (L1). */
  'auth.verification': {
    schema: z.object({
      channels: z.object({ email: z.boolean(), phone: z.boolean() }),
      requiredForLearning: z.boolean(),
    }),
    default: { channels: { email: true, phone: false }, requiredForLearning: false },
    public: true,
  },
  /** Staff two-factor authentication policy (ARCHITECTURE §4: required for Super Admins). */
  'auth.staffMfa': {
    schema: z.object({ requiredFor: z.enum(['none', 'super_admins', 'all_staff']) }),
    default: { requiredFor: 'super_admins' as const },
    public: false,
  },
  /** D-032: days between a self-service deletion request and erasure (owner chose 7). */
  'account.deletionGraceDays': {
    schema: z.object({ days: z.number().int().min(1).max(60) }),
    default: { days: 7 },
    public: false,
  },
  /** S24. */
  'app.maintenance': {
    schema: z.object({ enabled: z.boolean(), message: LocalizedText.nullable() }),
    default: { enabled: false, message: null },
    public: true,
  },
  /** S24 force update: semantic versions below these must update. */
  'app.minVersions': {
    schema: z.object({
      android: z
        .string()
        .regex(/^\d+\.\d+\.\d+$/)
        .nullable(),
      ios: z
        .string()
        .regex(/^\d+\.\d+\.\d+$/)
        .nullable(),
    }),
    default: { android: null, ios: null },
    public: true,
  },
  /** S24: where the "Update now" button sends students (Play Store / App Store pages). */
  'app.storeLinks': {
    schema: z.object({
      android: z
        .url({ protocol: /^https$/ })
        .max(500)
        .nullable(),
      ios: z
        .url({ protocol: /^https$/ })
        .max(500)
        .nullable(),
    }),
    default: { android: null, ios: null },
    public: true,
  },
  /** D-027. Purchase channel per platform — switchable without an app release. */
  'purchase.channels': {
    schema: z.object({
      android: z.enum(['in_app', 'web_only', 'disabled']),
      ios: z.enum(['web_only', 'disabled']),
      web: z.enum(['enabled', 'disabled']),
    }),
    default: { android: 'in_app' as const, ios: 'web_only' as const, web: 'enabled' as const },
    public: true,
  },
  /**
   * D-016 / DYNAMIC_ADMIN_AUDIT §4.2: question types the team may author, and optional display names.
   * Turning a type off stops new questions of that type; existing ones keep working.
   */
  'questions.types': {
    schema: z.object({
      enabled: z.array(QuestionType).min(1, 'Keep at least one question type'),
      labels: z.partialRecord(QuestionType, LocalizedText).default({}),
    }),
    default: {
      enabled: [
        'single_choice',
        'multiple_choice',
        'true_false',
        'fill_blank',
        'match',
        'numeric',
        'subjective',
      ] as QuestionType[],
      labels: {},
    },
    public: true,
  },
  /**
   * Prefill for new assessments (D-017 quiz answers: results after submission, explanations shown, unlimited
   * retakes). Scoring choices start unset (null): the admin chooses them per assessment (D-044) until defaults are set
   * here.
   */
  'assessments.defaults': {
    schema: z.object({
      resultRelease: z.enum(['immediate', 'after_close', 'manual']),
      showExplanations: z.boolean(),
      maxAttempts: z.number().int().min(1).max(100).nullable(),
      /** D-048 (owner, 2026-10-04). Defaults keep earlier saved values valid. */
      premiumAccess: z.enum(['linked', 'any_course', 'plans_only']).default('linked'),
      lateStart: z.enum(['until_close', 'full_duration']).default('until_close'),
      countedAttempt: z.enum(['first', 'best', 'latest']).default('first'),
      scoring: z.object({
        negativeMarking: z.boolean().nullable(),
        multipleChoice: z.enum(['all_or_nothing', 'partial_if_no_wrong']).nullable(),
        match: z.enum(['all_or_nothing', 'per_pair']).nullable(),
        fillBlank: z.enum(['all_or_nothing', 'per_blank']).nullable(),
        scoreFloor: z.enum(['none', 'zero']).nullable(),
      }),
    }),
    default: {
      resultRelease: 'immediate' as const,
      showExplanations: true,
      maxAttempts: null,
      premiumAccess: 'linked' as const,
      lateStart: 'until_close' as const,
      countedAttempt: 'first' as const,
      scoring: {
        negativeMarking: null,
        multipleChoice: null,
        match: null,
        fillBlank: null,
        scoreFloor: null,
      },
    },
    public: false,
  },
  /**
   * Attempt timing (§10). Answers that arrive up to `graceSeconds` after an attempt's deadline are still accepted (a
   * slow network must not lose the last answers); after that the attempt is submitted automatically.
   */
  'assessments.timing': {
    schema: z.object({ graceSeconds: z.number().int().min(0).max(300) }),
    default: { graceSeconds: 30 },
    public: false,
  },
  /** D-049: how other students appear on leaderboards (first name + initial by default; or full names; or none). */
  'leaderboards.display': {
    schema: z.object({ names: z.enum(['first_initial', 'full', 'none']) }),
    default: { names: 'first_initial' as const },
    public: false,
  },
  /** D-049: past daily challenges stay open as practice (never counting for the streak or that day's ranking). */
  'dailyChallenge.rules': {
    schema: z.object({ pastAsPractice: z.boolean() }),
    default: { pastAsPractice: true },
    public: false,
  },
  /**
   * Where a certificate can be checked, printed with a QR code on every certificate: `{baseUrl}/{code}` (e.g. the
   * website's verification page). Unset = the PDF shows only the certificate number.
   */
  'certificates.verification': {
    schema: z.object({
      baseUrl: z
        .url({ protocol: /^https$/ })
        .max(300)
        .refine((v) => !v.endsWith('/'), 'Leave out the trailing /')
        .nullable(),
    }),
    default: { baseUrl: null },
    public: false,
  },
} as const satisfies Record<string, { schema: z.ZodType; default: unknown; public: boolean }>;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function isSettingKey(value: string): value is SettingKey {
  return Object.hasOwn(SETTINGS, value);
}
