import { z } from 'zod';
import { LocalizedText } from './common.js';

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
} as const satisfies Record<string, { schema: z.ZodType; default: unknown; public: boolean }>;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function isSettingKey(value: string): value is SettingKey {
  return Object.hasOwn(SETTINGS, value);
}
