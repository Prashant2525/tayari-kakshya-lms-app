import {
  adToBs,
  bsToAd,
  formatBs,
  instantToBs,
  kathmanduDate,
  toDevanagariDigits,
  type BsDate,
} from '@tk/domain';
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

/** Today's Nepal calendar day as `YYYY-MM-DD` (daily challenges belong to Nepal days, D-049). */
export function nepalToday(now = new Date()): string {
  const d = kathmanduDate(now);
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/** BS date and Nepal time (24-hour) for an ISO timestamp, e.g. "17 Asoj 2083, 10:00". */
export function bsDateTime(iso: string, locale: Locale): string {
  // Nepal is UTC+5:45 all year (no daylight saving).
  const npt = new Date(new Date(iso).getTime() + 345 * 60_000);
  const time = `${String(npt.getUTCHours()).padStart(2, '0')}:${String(npt.getUTCMinutes()).padStart(2, '0')}`;
  return `${bsDate(iso, locale)}, ${locale === 'ne' ? toDevanagariDigits(time) : time}`;
}

/** "0:42" style countdown, in Devanagari digits for Nepali. */
export function countdown(seconds: number, locale: Locale): string {
  const s = Math.max(0, Math.ceil(seconds));
  const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return locale === 'ne' ? toDevanagariDigits(text) : text;
}

/** The API stores dates of birth as AD `YYYY-MM-DD` (D-009); students pick them in BS. */
export function adIsoToBs(iso: string): BsDate {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return adToBs({ year, month, day });
}

export function bsToAdIso(bs: BsDate): string {
  const ad = bsToAd(bs);
  return `${ad.year}-${String(ad.month).padStart(2, '0')}-${String(ad.day).padStart(2, '0')}`;
}
