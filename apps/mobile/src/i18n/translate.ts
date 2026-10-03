import type { LocalizedText } from '@tk/contracts';
import { toDevanagariDigits } from '@tk/domain';
import { en, type MessageKey } from './en';
import { ne } from './ne';

export type Locale = 'en' | 'ne';
export type TranslateVars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: TranslateVars) => string;

const catalogs: Record<Locale, Record<MessageKey, string>> = { en, ne };

/** Numbers in Nepali text use Devanagari digits (१२३); strings are inserted as given. */
function formatVar(value: string | number, locale: Locale): string {
  return typeof value === 'number' && locale === 'ne' ? toDevanagariDigits(value) : String(value);
}

export function translate(locale: Locale, key: MessageKey, vars?: TranslateVars): string {
  const template = catalogs[locale][key] ?? en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? formatVar(vars[name] as string | number, locale) : match,
  );
}

/** CMS text in the reader's language, falling back to the other one (D-008). */
export function localized(text: LocalizedText | null | undefined, locale: Locale): string {
  if (!text) return '';
  return (locale === 'ne' ? (text.ne ?? text.en) : (text.en ?? text.ne)) ?? '';
}

/** First run: Nepali when the phone is set to Nepali, otherwise English. */
export function defaultLocale(deviceLanguageCodes: ReadonlyArray<string | null>): Locale {
  return deviceLanguageCodes.some((c) => c?.toLowerCase() === 'ne') ? 'ne' : 'en';
}
