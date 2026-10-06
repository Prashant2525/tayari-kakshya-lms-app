import type { LocalizedText } from '@tk/contracts';
import { formatNpr } from '@tk/domain';

/** Coupon codes (D-025, D-054, D-056). */

export const APPLIES_TO_LABEL = {
  everything: 'All courses and plans',
  all_courses: 'All courses',
  all_plans: 'All plans',
  selected: 'Chosen courses and plans',
} as const;
export type AppliesTo = keyof typeof APPLIES_TO_LABEL;

export const COUPON_STATE = {
  active: { label: 'Active', tone: 'success' },
  scheduled: { label: 'Starts later', tone: 'primary' },
  ended: { label: 'Ended', tone: 'neutral' },
  inactive: { label: 'Switched off', tone: 'neutral' },
} as const;
export type CouponState = keyof typeof COUPON_STATE;

export interface CouponRow {
  id: string;
  code: string;
  note: string | null;
  discountType: 'percent' | 'fixed';
  percentBps: number | null;
  amountPaisa: number | null;
  maxDiscountPaisa: number | null;
  minOrderPaisa: number | null;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  perUserLimit: number | null;
  appliesTo: AppliesTo;
  allowOnSale: boolean;
  active: boolean;
  state: CouponState;
  createdAt: string;
  usedCount: number;
}

export interface CouponDetail extends CouponRow {
  courseIds: string[];
  planIds: string[];
  shareBaseUrl: string | null;
  reservedCount: number;
  recentOrders: Array<{
    id: string;
    orderNo: number;
    student: string;
    items: LocalizedText[];
    discountPaisa: number;
    totalPaisa: number;
    paidAt: string | null;
  }>;
}

/** "10% off (up to Rs 500)" / "Rs 300 off". */
export function discountLabel(
  c: Pick<CouponRow, 'discountType' | 'percentBps' | 'amountPaisa' | 'maxDiscountPaisa'>,
) {
  if (c.discountType === 'fixed') return `${formatNpr(c.amountPaisa ?? 0, 'en')} off`;
  const pct = `${(c.percentBps ?? 0) / 100}% off`;
  return c.maxDiscountPaisa ? `${pct} (up to ${formatNpr(c.maxDiscountPaisa, 'en')})` : pct;
}
