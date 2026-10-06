import 'server-only';
import type { LocalizedText } from '@tk/contracts';
import { formatBs, formatNpr, instantToBs } from '@tk/domain';
import { cookies, headers } from 'next/headers';
import { translator, type Locale } from './messages';
import { COOKIE } from './tokens';

/** The reader's language: their choice (cookie), else their browser's, else English (D-008). */
export async function getLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(COOKIE.locale)?.value;
  if (chosen === 'en' || chosen === 'ne') return chosen;
  const accept = (await headers()).get('accept-language') ?? '';
  return /^ne\b/i.test(accept) ? 'ne' : 'en';
}

export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: translator(locale), ...formatters(locale) };
}

export function formatters(locale: Locale) {
  return {
    /** CMS text in the reader's language, falling back to the other one. */
    localized: (text: LocalizedText | null | undefined) =>
      text ? (text[locale] ?? text.en ?? text.ne ?? '') : '',
    npr: (paisa: number) => formatNpr(paisa, locale),
    /** Dates in Bikram Sambat (D-009). */
    bsDate: (iso: string) => formatBs(instantToBs(new Date(iso)), locale),
  };
}
