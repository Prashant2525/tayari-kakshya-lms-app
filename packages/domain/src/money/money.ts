/**
 * Money helpers. All amounts are integer **paisa** (NPR × 100). Rates are integer **basis points**
 * (1% = 100 bps) so no floating-point arithmetic touches money. Rates and inclusive/exclusive mode are
 * CMS settings (D-026) — nothing here hard-codes a business value.
 * Rounding policy: half-up to the nearest paisa.
 */
import type { DisplayLocale } from '../bs-date/bs-date.js';

export type Paisa = number;
export type BasisPoints = number;

const BPS_DENOMINATOR = 10_000n;

export class MoneyError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export function assertPaisa(value: number, label = 'amount'): asserts value is Paisa {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new MoneyError(`${label} must be a non-negative integer number of paisa (got ${value})`);
  }
}

export function assertBasisPoints(value: number, label = 'rate'): asserts value is BasisPoints {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000) {
    throw new MoneyError(
      `${label} must be an integer number of basis points between 0 and 100000 (got ${value})`,
    );
  }
}

/** Integer division of non-negative bigints rounded half-up. */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

export interface TaxBreakdown {
  netPaisa: Paisa;
  taxPaisa: Paisa;
  grossPaisa: Paisa;
}

/**
 * Splits or adds tax.
 * - `inclusive: true`  → `amountPaisa` already contains tax (gross); returns its net/tax split.
 * - `inclusive: false` → tax is added on top of `amountPaisa` (net).
 */
export function computeTax(params: {
  amountPaisa: Paisa;
  rateBps: BasisPoints;
  inclusive: boolean;
}): TaxBreakdown {
  const { amountPaisa, rateBps, inclusive } = params;
  assertPaisa(amountPaisa);
  assertBasisPoints(rateBps);
  const amount = BigInt(amountPaisa);
  const rate = BigInt(rateBps);
  if (inclusive) {
    const net = divRoundHalfUp(amount * BPS_DENOMINATOR, BPS_DENOMINATOR + rate);
    return { netPaisa: Number(net), taxPaisa: Number(amount - net), grossPaisa: amountPaisa };
  }
  const tax = divRoundHalfUp(amount * rate, BPS_DENOMINATOR);
  return { netPaisa: amountPaisa, taxPaisa: Number(tax), grossPaisa: Number(amount + tax) };
}

export type Discount =
  | { type: 'percent'; valueBps: BasisPoints; maxDiscountPaisa?: Paisa | null }
  | { type: 'fixed'; valuePaisa: Paisa };

/** Discount amount for a price; never exceeds the price, honours an optional cap. */
export function discountAmount(pricePaisa: Paisa, discount: Discount): Paisa {
  assertPaisa(pricePaisa, 'price');
  let amount: number;
  if (discount.type === 'percent') {
    assertBasisPoints(discount.valueBps, 'discount');
    if (discount.valueBps > 10_000) throw new MoneyError('percent discount cannot exceed 100%');
    amount = Number(divRoundHalfUp(BigInt(pricePaisa) * BigInt(discount.valueBps), BPS_DENOMINATOR));
    if (discount.maxDiscountPaisa != null) {
      assertPaisa(discount.maxDiscountPaisa, 'max discount');
      amount = Math.min(amount, discount.maxDiscountPaisa);
    }
  } else {
    assertPaisa(discount.valuePaisa, 'discount');
    amount = discount.valuePaisa;
  }
  return Math.min(amount, pricePaisa);
}

/** Converts whole rupees (e.g. from an admin form) to paisa without float error. Accepts up to 2 decimals. */
export function rupeesToPaisa(rupees: string): Paisa {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(rupees.trim());
  if (!match) throw new MoneyError(`Invalid rupee amount "${rupees}"`);
  const paisa = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  assertPaisa(paisa);
  return paisa;
}

/** "Rs 1,00,000" / "Rs 3,000.50" (en) or "रु १,००,०००" (ne) — South Asian digit grouping. */
export function formatNpr(paisa: Paisa, locale: DisplayLocale): string {
  assertPaisa(paisa);
  const hasPaisa = paisa % 100 !== 0;
  const number = new Intl.NumberFormat(locale === 'ne' ? 'ne-NP' : 'en-IN', {
    minimumFractionDigits: hasPaisa ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(paisa / 100);
  return `${locale === 'ne' ? 'रु' : 'Rs'} ${number}`;
}
