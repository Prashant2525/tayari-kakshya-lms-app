import type { Locale } from '@/i18n/translate';
import { bsDate, todayLabel } from '@/lib/dates';

/** Midday in Nepal on a `YYYY-MM-DD` day, so BS dates and weekdays come out right in any phone time zone. */
const noonOf = (day: string) => `${day}T06:15:00Z`;

/** A plan day: "Saturday, 17 Asoj 2083". */
export const planDayLabel = (day: string, locale: Locale) => todayLabel(new Date(noonOf(day)), locale);

/** The exam date (AD `YYYY-MM-DD`) in BS: "17 Asoj 2083". */
export const examDateLabel = (day: string, locale: Locale) => bsDate(noonOf(day), locale);
