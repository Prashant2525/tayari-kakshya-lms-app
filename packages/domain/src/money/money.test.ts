import { describe, expect, it } from 'vitest';
import { computeTax, discountAmount, formatNpr, MoneyError, rupeesToPaisa } from './money.js';

// Rates below are arbitrary test inputs, not business values.
describe('computeTax', () => {
  it('adds tax on top of a net amount (exclusive)', () => {
    expect(computeTax({ amountPaisa: 100_000, rateBps: 1300, inclusive: false })).toEqual({
      netPaisa: 100_000,
      taxPaisa: 13_000,
      grossPaisa: 113_000,
    });
  });

  it('splits a gross amount (inclusive) and always reconciles net + tax = gross', () => {
    for (const gross of [1, 99, 113_000, 300_000, 999_999, 12_345_678]) {
      const r = computeTax({ amountPaisa: gross, rateBps: 1300, inclusive: true });
      expect(r.grossPaisa).toBe(gross);
      expect(r.netPaisa + r.taxPaisa).toBe(gross);
    }
    expect(computeTax({ amountPaisa: 113_000, rateBps: 1300, inclusive: true })).toEqual({
      netPaisa: 100_000,
      taxPaisa: 13_000,
      grossPaisa: 113_000,
    });
  });

  it('rounds half up to the paisa', () => {
    // 5 paisa × 10% = 0.5 → 1
    expect(computeTax({ amountPaisa: 5, rateBps: 1000, inclusive: false }).taxPaisa).toBe(1);
    // 4 paisa × 10% = 0.4 → 0
    expect(computeTax({ amountPaisa: 4, rateBps: 1000, inclusive: false }).taxPaisa).toBe(0);
  });

  it('handles a zero rate (tax disabled)', () => {
    expect(computeTax({ amountPaisa: 300_000, rateBps: 0, inclusive: true })).toEqual({
      netPaisa: 300_000,
      taxPaisa: 0,
      grossPaisa: 300_000,
    });
  });

  it('rejects fractional or negative money and invalid rates', () => {
    expect(() => computeTax({ amountPaisa: 10.5, rateBps: 100, inclusive: false })).toThrow(MoneyError);
    expect(() => computeTax({ amountPaisa: -1, rateBps: 100, inclusive: false })).toThrow(MoneyError);
    expect(() => computeTax({ amountPaisa: 100, rateBps: 13.5, inclusive: false })).toThrow(MoneyError);
  });
});

describe('discountAmount', () => {
  it('applies percent discounts with an optional cap', () => {
    expect(discountAmount(300_000, { type: 'percent', valueBps: 2000 })).toBe(60_000);
    expect(discountAmount(300_000, { type: 'percent', valueBps: 2000, maxDiscountPaisa: 50_000 })).toBe(
      50_000,
    );
  });

  it('never discounts more than the price', () => {
    expect(discountAmount(10_000, { type: 'fixed', valuePaisa: 50_000 })).toBe(10_000);
    expect(discountAmount(10_000, { type: 'percent', valueBps: 10_000 })).toBe(10_000);
  });

  it('rejects percentages above 100%', () => {
    expect(() => discountAmount(10_000, { type: 'percent', valueBps: 10_001 })).toThrow(MoneyError);
  });
});

describe('rupeesToPaisa', () => {
  it('parses admin input without float error', () => {
    expect(rupeesToPaisa('3000')).toBe(300_000);
    expect(rupeesToPaisa('0.1')).toBe(10);
    expect(rupeesToPaisa('19.99')).toBe(1999);
    expect(() => rupeesToPaisa('1.234')).toThrow(MoneyError);
    expect(() => rupeesToPaisa('-5')).toThrow(MoneyError);
  });
});

describe('formatNpr', () => {
  it('uses South Asian grouping and Devanagari digits for Nepali', () => {
    expect(formatNpr(300_000, 'en')).toBe('Rs 3,000');
    expect(formatNpr(10_000_000, 'en')).toBe('Rs 1,00,000');
    expect(formatNpr(300_050, 'en')).toBe('Rs 3,000.50');
    expect(formatNpr(300_000, 'ne')).toBe('रु ३,०००');
    expect(formatNpr(10_000_050, 'ne')).toBe('रु १,००,०००.५०');
  });
});
