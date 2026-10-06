import type { Translate } from './messages';
import type { Validity } from './types';

/** "Access for 30 days" / "Access until …" / "Access with no end date". */
export function validityText(v: Validity, t: Translate, bsDate: (iso: string) => string) {
  return v.type === 'days' && v.days
    ? t('course.validityDays', { days: v.days })
    : v.type === 'fixed_date' && v.endsOn
      ? t('course.validityUntil', { date: bsDate(`${v.endsOn}T00:00:00+05:45`) })
      : t('course.validityLifetime');
}
