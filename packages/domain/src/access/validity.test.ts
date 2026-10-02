import { describe, expect, it } from 'vitest';
import { kathmanduDayKey } from '../bs-date/bs-date.js';
import { AccessValidityError, accessEndsAt } from './validity.js';

const start = new Date('2026-10-02T10:00:00.000Z');

describe('accessEndsAt', () => {
  it('never ends for lifetime access', () => {
    expect(accessEndsAt({ type: 'lifetime' }, start)).toBeNull();
  });

  it('adds exact 24-hour days', () => {
    expect(accessEndsAt({ type: 'days', days: 1 }, start)?.toISOString()).toBe('2026-10-03T10:00:00.000Z');
    expect(accessEndsAt({ type: 'days', days: 365 }, start)?.toISOString()).toBe('2027-10-02T10:00:00.000Z');
  });

  it('ends a fixed date at midnight after that day in Nepal (UTC+05:45)', () => {
    const end = accessEndsAt({ type: 'fixed_date', endsOn: '2027-04-13' }, start) as Date;
    expect(end.toISOString()).toBe('2027-04-13T18:15:00.000Z');
    // The last included instant is still on the configured day in Nepal; the end instant is the next day.
    expect(kathmanduDayKey(new Date(end.getTime() - 1))).toBe('2027-04-13');
    expect(kathmanduDayKey(end)).toBe('2027-04-14');
  });

  it('does not depend on the start time for fixed dates', () => {
    const a = accessEndsAt({ type: 'fixed_date', endsOn: '2027-01-01' }, start);
    const b = accessEndsAt({ type: 'fixed_date', endsOn: '2027-01-01' }, new Date('2026-12-31T23:59:00Z'));
    expect(a).toEqual(b);
  });

  it('rejects invalid input', () => {
    for (const days of [0, -1, 1.5, Number.NaN]) {
      expect(() => accessEndsAt({ type: 'days', days }, start)).toThrow(AccessValidityError);
    }
    for (const endsOn of ['2027-02-30', '2027-13-01', '27-01-01', '2027-1-1', '']) {
      expect(() => accessEndsAt({ type: 'fixed_date', endsOn }, start)).toThrow(AccessValidityError);
    }
  });
});
