import { formatBs, instantToBs, kathmanduDate, toDevanagariDigits } from '@tk/domain';
import type { Locale } from '@/i18n/translate';

const WEEKDAYS: Record<Locale, readonly string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ne: ['आइतबार', 'सोमबार', 'मङ्गलबार', 'बुधबार', 'बिहीबार', 'शुक्रबार', 'शनिबार'],
};

/** Weekday in Nepal (Asia/Kathmandu), whatever the phone's own time zone is. */
export function kathmanduWeekday(instant: Date, locale: Locale): string {
  const ad = kathmanduDate(instant);
  const day = new Date(Date.UTC(ad.year, ad.month - 1, ad.day)).getUTCDay();
  return WEEKDAYS[locale][day] ?? '';
}

/** Dates are shown in Bikram Sambat (D-009), e.g. "Saturday, 17 Asoj 2083" / "शनिबार, १७ असोज २०८३". */
export function todayLabel(instant: Date, locale: Locale): string {
  return `${kathmanduWeekday(instant, locale)}, ${formatBs(instantToBs(instant), locale)}`;
}

/** BS date for an ISO timestamp from the API. */
export function bsDate(iso: string, locale: Locale): string {
  return formatBs(instantToBs(new Date(iso)), locale);
}

/** "0:42" style countdown, in Devanagari digits for Nepali. */
export function countdown(seconds: number, locale: Locale): string {
  const s = Math.max(0, Math.ceil(seconds));
  const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return locale === 'ne' ? toDevanagariDigits(text) : text;
}
