import { Email, Password } from '@tk/contracts';
import type { MessageKey } from '@/i18n/en';

/**
 * Client-side checks mirror the shared contracts so students get instant, translated feedback.
 * The server validates again; these are UX only.
 */
export type FieldErrors<K extends string> = Partial<Record<K, MessageKey>>;

export function checkEmail(value: string): MessageKey | undefined {
  if (!value.trim()) return 'validation.required';
  return Email.safeParse(value).success ? undefined : 'validation.email';
}

export function checkPassword(value: string): MessageKey | undefined {
  if (!value) return 'validation.required';
  return Password.safeParse(value).success ? undefined : 'validation.passwordLength';
}

export function checkName(value: string): MessageKey | undefined {
  return value.trim().length >= 2 ? undefined : 'validation.nameLength';
}

export function checkCode(value: string): MessageKey | undefined {
  return /^\d{6}$/.test(value) ? undefined : 'validation.code';
}

/** Nepali mobile numbers: 10 digits starting 96/97/98 (with or without +977). Returns E.164 or null. */
export function toNepalE164(value: string): string | null {
  const digits = value.replace(/[\s-]/g, '').replace(/^\+?977/, '');
  return /^9[678]\d{8}$/.test(digits) ? `+977${digits}` : null;
}

export function hasErrors<K extends string>(errors: FieldErrors<K>): boolean {
  return Object.values(errors).some(Boolean);
}
