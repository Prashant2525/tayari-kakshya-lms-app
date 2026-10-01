import { createRequire } from 'node:module';

/**
 * Bikram Sambat (BS) calendar helpers (D-009).
 * Storage is always UTC timestamps / AD dates; BS is a display and input concern.
 * Conversion tables come from `nepali-date-converter` (MIT), wrapped so the rest of the codebase
 * never depends on that library's API. Supported range: BS 2000-01-01 … 2090-12-30.
 */
const require = createRequire(import.meta.url);
const lib = require('nepali-date-converter') as { default?: NepaliDateCtor } & NepaliDateCtor;
const NepaliDate: NepaliDateCtor = lib.default ?? lib;

interface NepaliDateInstance {
  getYear(): number;
  getMonth(): number;
  getDate(): number;
  toJsDate(): Date;
}
interface NepaliDateCtor {
  new (date: Date): NepaliDateInstance;
  new (year: number, monthIndex: number, day: number): NepaliDateInstance;
}

export interface CalendarDate {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}
export type BsDate = CalendarDate;
export type AdDate = CalendarDate;
export type DisplayLocale = 'en' | 'ne';

export const NEPAL_TIME_ZONE = 'Asia/Kathmandu';
export const BS_MIN_YEAR = 2000;
export const BS_MAX_YEAR = 2090;

export const BS_MONTH_NAMES: Record<DisplayLocale, readonly string[]> = {
  en: [
    'Baisakh',
    'Jestha',
    'Asar',
    'Shrawan',
    'Bhadra',
    'Asoj',
    'Kartik',
    'Mangsir',
    'Poush',
    'Magh',
    'Falgun',
    'Chaitra',
  ],
  ne: ['बैशाख', 'जेठ', 'असार', 'साउन', 'भदौ', 'असोज', 'कात्तिक', 'मंसिर', 'पुस', 'माघ', 'फागुन', 'चैत'],
};

const DEVANAGARI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

export class BsDateRangeError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = 'BsDateRangeError';
  }
}

/** Calendar date (AD) of an instant as observed in Nepal (UTC+05:45). */
export function kathmanduDate(instant: Date): AdDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NEPAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** `YYYY-MM-DD` (AD) of the Nepal calendar day — the day key for streaks and daily challenges. */
export function kathmanduDayKey(instant: Date): string {
  return formatIso(kathmanduDate(instant));
}

export function adToBs(ad: AdDate): BsDate {
  assertValidAd(ad);
  try {
    // Local-noon construction keeps the library independent of the host time zone.
    const nd = new NepaliDate(new Date(ad.year, ad.month - 1, ad.day, 12));
    return { year: nd.getYear(), month: nd.getMonth() + 1, day: nd.getDate() };
  } catch (err) {
    throw new BsDateRangeError(
      `AD date ${formatIso(ad)} is outside the supported BS range: ${(err as Error).message}`,
    );
  }
}

export function bsToAd(bs: BsDate): AdDate {
  if (!isValidBs(bs)) throw new BsDateRangeError(`Invalid BS date ${formatIso(bs)}`);
  return unsafeBsToAd(bs);
}

/** BS date of an instant in Nepal time. */
export function instantToBs(instant: Date): BsDate {
  return adToBs(kathmanduDate(instant));
}

/** True only for real calendar dates inside the supported range (the library silently rolls over invalid days). */
export function isValidBs(bs: BsDate): boolean {
  if (![bs.year, bs.month, bs.day].every(Number.isInteger)) return false;
  if (
    bs.year < BS_MIN_YEAR ||
    bs.year > BS_MAX_YEAR ||
    bs.month < 1 ||
    bs.month > 12 ||
    bs.day < 1 ||
    bs.day > 32
  ) {
    return false;
  }
  try {
    const back = adToBs(unsafeBsToAd(bs));
    return back.year === bs.year && back.month === bs.month && back.day === bs.day;
  } catch {
    return false;
  }
}

/** Number of days in a BS month (29–32). */
export function daysInBsMonth(year: number, month: number): number {
  for (let day = 32; day >= 29; day--) {
    if (isValidBs({ year, month, day })) return day;
  }
  throw new BsDateRangeError(`BS month ${year}-${month} is outside the supported range`);
}

/** Nepal fiscal year (1 Shrawan – end of Asar) of a BS date, formatted like `2082/83`. */
export function fiscalYearOf(bs: BsDate): string {
  const start = bs.month >= 4 ? bs.year : bs.year - 1;
  return `${start}/${pad2((start + 1) % 100)}`;
}

export function toDevanagariDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => DEVANAGARI_DIGITS[Number(d)] ?? d);
}

/**
 * Formats a BS date.
 * - `long`:  "1 Baisakh 2082" / "१ बैशाख २०८२"
 * - `short`: "2082-01-01" / "२०८२-०१-०१"
 */
export function formatBs(bs: BsDate, locale: DisplayLocale, style: 'long' | 'short' = 'long'): string {
  const text =
    style === 'short' ? formatIso(bs) : `${bs.day} ${BS_MONTH_NAMES[locale][bs.month - 1] ?? ''} ${bs.year}`;
  return locale === 'ne' ? toDevanagariDigits(text) : text;
}

function unsafeBsToAd(bs: BsDate): AdDate {
  try {
    const js = new NepaliDate(bs.year, bs.month - 1, bs.day).toJsDate();
    return { year: js.getFullYear(), month: js.getMonth() + 1, day: js.getDate() };
  } catch (err) {
    throw new BsDateRangeError((err as Error).message);
  }
}

function assertValidAd(ad: AdDate): void {
  const js = new Date(Date.UTC(ad.year, ad.month - 1, ad.day));
  if (js.getUTCFullYear() !== ad.year || js.getUTCMonth() !== ad.month - 1 || js.getUTCDate() !== ad.day) {
    throw new BsDateRangeError(`Invalid AD date ${formatIso(ad)}`);
  }
}

function formatIso(d: CalendarDate): string {
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
