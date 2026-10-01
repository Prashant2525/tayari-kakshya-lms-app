import { describe, expect, it } from 'vitest';
import {
  adToBs,
  bsToAd,
  BsDateRangeError,
  daysInBsMonth,
  fiscalYearOf,
  formatBs,
  instantToBs,
  isValidBs,
  kathmanduDayKey,
  toDevanagariDigits,
} from './bs-date.js';

// Reference points: Nepali New Year (1 Baisakh) for recent years.
const NEW_YEARS: Array<[number, [number, number, number]]> = [
  [2080, [2023, 4, 14]],
  [2081, [2024, 4, 13]],
  [2082, [2025, 4, 14]],
];

describe('BS ⇄ AD conversion', () => {
  it.each(NEW_YEARS)('1 Baisakh %i matches the reference AD date', (bsYear, [y, m, d]) => {
    expect(adToBs({ year: y, month: m, day: d })).toEqual({ year: bsYear, month: 1, day: 1 });
    expect(bsToAd({ year: bsYear, month: 1, day: 1 })).toEqual({ year: y, month: m, day: d });
  });

  it('round-trips and advances by exactly one BS day across a full year', () => {
    let ad = bsToAd({ year: 2082, month: 1, day: 1 });
    let previous = adToBs(ad);
    for (let i = 0; i < 400; i++) {
      const next = new Date(Date.UTC(ad.year, ad.month - 1, ad.day + 1));
      ad = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
      const bs = adToBs(ad);
      expect(bsToAd(bs)).toEqual(ad);
      const advanced =
        (bs.year === previous.year && bs.month === previous.month && bs.day === previous.day + 1) ||
        (bs.day === 1 &&
          (bs.month === previous.month + 1 || (bs.month === 1 && bs.year === previous.year + 1)));
      expect(advanced).toBe(true);
      previous = bs;
    }
  });
});

describe('validation', () => {
  it('rejects impossible and out-of-range dates instead of rolling over', () => {
    expect(isValidBs({ year: 2081, month: 1, day: 32 })).toBe(false);
    expect(isValidBs({ year: 2081, month: 13, day: 1 })).toBe(false);
    expect(isValidBs({ year: 1999, month: 1, day: 1 })).toBe(false);
    expect(isValidBs({ year: 2091, month: 1, day: 1 })).toBe(false);
    expect(isValidBs({ year: 2082, month: 1, day: 1.5 })).toBe(false);
    expect(() => bsToAd({ year: 2081, month: 1, day: 32 })).toThrow(BsDateRangeError);
    expect(() => adToBs({ year: 2025, month: 2, day: 30 })).toThrow(BsDateRangeError);
  });

  it('reports month lengths between 29 and 32 that sum to the whole year', () => {
    const lengths = Array.from({ length: 12 }, (_, i) => daysInBsMonth(2082, i + 1));
    lengths.forEach((n) => {
      expect(n).toBeGreaterThanOrEqual(29);
      expect(n).toBeLessThanOrEqual(32);
    });
    const start = bsToAd({ year: 2082, month: 1, day: 1 });
    const end = bsToAd({ year: 2083, month: 1, day: 1 });
    const days =
      (Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(start.year, start.month - 1, start.day)) /
      86_400_000;
    expect(lengths.reduce((a, b) => a + b, 0)).toBe(days);
  });
});

describe('Nepal time zone', () => {
  it('uses the Kathmandu calendar day (UTC+05:45)', () => {
    // 2025-04-13T18:15Z is 2025-04-14 00:00 in Kathmandu → 1 Baisakh 2082.
    expect(kathmanduDayKey(new Date('2025-04-13T18:15:00Z'))).toBe('2025-04-14');
    expect(instantToBs(new Date('2025-04-13T18:15:00Z'))).toEqual({ year: 2082, month: 1, day: 1 });
    expect(kathmanduDayKey(new Date('2025-04-13T18:14:59Z'))).toBe('2025-04-13');
  });
});

describe('formatting', () => {
  it('formats in English and Nepali', () => {
    const bs = { year: 2082, month: 1, day: 1 };
    expect(formatBs(bs, 'en')).toBe('1 Baisakh 2082');
    expect(formatBs(bs, 'ne')).toBe('१ बैशाख २०८२');
    expect(formatBs(bs, 'en', 'short')).toBe('2082-01-01');
    expect(formatBs(bs, 'ne', 'short')).toBe('२०८२-०१-०१');
    expect(toDevanagariDigits('Rs 1,234')).toBe('Rs १,२३४');
  });

  it('derives the Nepal fiscal year (starts 1 Shrawan)', () => {
    expect(fiscalYearOf({ year: 2082, month: 3, day: 32 })).toBe('2081/82');
    expect(fiscalYearOf({ year: 2082, month: 4, day: 1 })).toBe('2082/83');
    expect(fiscalYearOf({ year: 2089, month: 4, day: 1 })).toBe('2089/90');
  });
});
