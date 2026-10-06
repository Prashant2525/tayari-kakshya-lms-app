import { describe, expect, it } from 'vitest';
import { failureText } from './failure';
import { en, ne, translator } from './messages';

describe('website text (D-008)', () => {
  it('has every message in both languages', () => {
    expect(Object.keys(ne).sort()).toEqual(Object.keys(en).sort());
    for (const [key, text] of Object.entries(ne)) expect(text, key).not.toBe('');
  });

  it('fills placeholders, in Devanagari digits for Nepali', () => {
    expect(translator('en')('payment.orderLine', { no: '000123', amount: 'Rs 1,500' })).toBe(
      'Order #000123 · Rs 1,500',
    );
    expect(translator('ne')('course.validityDays', { days: 30 })).toBe('३० दिनको पहुँच');
  });

  it('explains failures in the reader’s language, never with the server’s text', () => {
    const t = translator('en');
    expect(
      failureText({ ok: false, code: 'COUPON_NOT_VALID', reason: 'used_up' }, t, 'checkout.alreadyHave'),
    ).toBe('This coupon has been used up.');
    expect(
      failureText(
        { ok: false, code: 'PURCHASE_NOT_AVAILABLE', reason: 'already_has_access' },
        t,
        'checkout.alreadyHavePlan',
      ),
    ).toBe('You already have this plan with no end date.');
    expect(failureText({ ok: false, code: 'SOMETHING_NEW', reason: null }, t, 'checkout.alreadyHave')).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
