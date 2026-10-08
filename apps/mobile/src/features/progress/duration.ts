import type { Locale } from '@/i18n/translate';
import type { useT } from '@/i18n/use-t';
import { num } from '@/lib/format';

type T = ReturnType<typeof useT>['t'];

/** Study time as "1 h 20 min" / "45 min" (whole minutes, in the reader's digits). */
export function studyDuration(seconds: number, t: T, locale: Locale): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? t('time.hm', { h: num(h, locale), m: num(m, locale) }) : t('time.m', { m: num(m, locale) });
}
