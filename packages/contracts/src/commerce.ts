import { z } from 'zod';
import { CursorQuery, LocalizedText } from './common.js';
import { CoursePricingInput, Slug, StatusChangeInput } from './content.js';

/** Orders and payments (Phase 11: D-003, D-023, D-027, D-051, D-052). */
export const PaymentProviderName = z.enum(['esewa', 'khalti', 'connectips']);
export type PaymentProviderName = z.infer<typeof PaymentProviderName>;

/** Coupon codes: letters, numbers and dashes; matched without regard to case (stored upper-case). */
export const CouponCode = z
  .string()
  .trim()
  .min(3, 'At least 3 characters')
  .max(32, 'At most 32 characters')
  .regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes only')
  .transform((s) => s.toUpperCase());

/** A course or a plan (exactly one), with an optional coupon (D-025). */
export const CreateOrderInput = z
  .object({ courseId: z.uuid().optional(), planId: z.uuid().optional(), couponCode: CouponCode.optional() })
  .refine((v) => Boolean(v.courseId) !== Boolean(v.planId), { message: 'Choose a course or a plan' });
export type CreateOrderInput = z.infer<typeof CreateOrderInput>;

/** The price the server would charge, before an order exists (checkout shows it; nothing is stored). */
export const OrderQuoteInput = CreateOrderInput;
export type OrderQuoteInput = z.infer<typeof OrderQuoteInput>;

// ───────────── Coupons (D-025, D-054, D-056) ─────────────

export const CouponDiscountType = z.enum(['percent', 'fixed']);
export type CouponDiscountType = z.infer<typeof CouponDiscountType>;
/** What a coupon can be used for. */
export const CouponAppliesTo = z.enum(['everything', 'all_courses', 'all_plans', 'selected']);
export type CouponAppliesTo = z.infer<typeof CouponAppliesTo>;

const Paisa = z.number().int().min(1).max(100_000_000);

export const CouponInput = z
  .object({
    code: CouponCode,
    /** Staff note (who it is for); never shown to students. */
    note: z.string().trim().max(300).nullable(),
    discountType: CouponDiscountType,
    /** Percent in basis points (10% = 1000; 100% = 10000). */
    percentBps: z.number().int().min(1).max(10_000).nullable(),
    amountPaisa: Paisa.nullable(),
    /** Largest discount for a percent coupon. */
    maxDiscountPaisa: Paisa.nullable(),
    /** Price (after any sale) needed before the coupon works. */
    minOrderPaisa: Paisa.nullable(),
    startsAt: z.iso.datetime().nullable(),
    endsAt: z.iso.datetime().nullable(),
    /** Uses by everyone together (null = no limit). */
    maxRedemptions: z.number().int().min(1).max(1_000_000).nullable(),
    /** Uses per student (null = no limit). */
    perUserLimit: z.number().int().min(1).max(1000).nullable(),
    appliesTo: CouponAppliesTo,
    courseIds: z.array(z.uuid()).max(500),
    planIds: z.array(z.uuid()).max(100),
    /** D-054: when on, the discount applies to the sale price; when off, the coupon does not work during a sale. */
    allowOnSale: z.boolean(),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.discountType === 'percent' && v.percentBps === null) {
      ctx.addIssue({ code: 'custom', path: ['percentBps'], message: 'Enter the percentage' });
    }
    if (v.discountType === 'fixed' && v.amountPaisa === null) {
      ctx.addIssue({ code: 'custom', path: ['amountPaisa'], message: 'Enter the amount' });
    }
    if (v.discountType === 'fixed' && v.maxDiscountPaisa !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxDiscountPaisa'],
        message: 'A largest discount applies to percent coupons only',
      });
    }
    if (v.startsAt && v.endsAt && v.startsAt >= v.endsAt) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'The coupon must end after it starts' });
    }
    if (v.appliesTo === 'selected' && v.courseIds.length + v.planIds.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['courseIds'], message: 'Choose at least one course or plan' });
    }
  });
export type CouponInput = z.infer<typeof CouponInput>;

// ───────────── Refunds (D-026, D-057) ─────────────

export const RefundStatusName = z.enum(['requested', 'approved', 'rejected', 'refunded']);
export type RefundStatusName = z.infer<typeof RefundStatusName>;

/** Staff record a request; someone with `refunds:approve` decides. */
export const RefundRequestInput = z.object({
  amountPaisa: z.number().int().min(1).max(100_000_000),
  reason: z.string().trim().min(3, 'Write the reason').max(1000),
});
export type RefundRequestInput = z.infer<typeof RefundRequestInput>;

export const RefundDecisionInput = z.object({ note: z.string().trim().max(1000).nullable() });
export type RefundDecisionInput = z.infer<typeof RefundDecisionInput>;

/** The money was sent back (eSewa / Khalti merchant portal, or bank): its reference there. */
export const RefundCompleteInput = z.object({
  reference: z.string().trim().min(1, 'Enter the reference').max(200),
  note: z.string().trim().max(1000).nullable(),
});
export type RefundCompleteInput = z.infer<typeof RefundCompleteInput>;

export const AdminRefundQuery = CursorQuery.extend({ status: RefundStatusName.optional() });
export type AdminRefundQuery = z.infer<typeof AdminRefundQuery>;

export const AdminCouponQuery = CursorQuery.extend({
  q: z.string().trim().min(1).max(60).optional(),
  state: z.enum(['active', 'inactive']).optional(),
});
export type AdminCouponQuery = z.infer<typeof AdminCouponQuery>;

// ───────────── Plans (D-023, D-054) ─────────────

export const PlanCoverage = z.enum(['all_courses', 'selected']);
export type PlanCoverage = z.infer<typeof PlanCoverage>;

export const PlanInput = z.object({
  slug: Slug,
  name: LocalizedText,
  description: LocalizedText.nullable(),
  /** Check-list lines on the plan card. */
  features: z.array(LocalizedText).max(20),
  coverage: PlanCoverage,
  isFeatured: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
});
export type PlanInput = z.infer<typeof PlanInput>;

/** Price and validity, as for courses (price 0 = shown for comparison, not sold). */
export const PlanPricingInput = CoursePricingInput;
export type PlanPricingInput = z.infer<typeof PlanPricingInput>;

export const PlanCoursesInput = z.object({ courseIds: z.array(z.uuid()).max(500) });
export type PlanCoursesInput = z.infer<typeof PlanCoursesInput>;

export const PlanStatusInput = StatusChangeInput;
export type PlanStatusInput = z.infer<typeof PlanStatusInput>;

/** `returnTo`: where the student lands after paying — the app (deep link) or the website (both allow-listed). */
export const PayOrderInput = z.object({
  provider: PaymentProviderName,
  returnTo: z.enum(['app', 'web']),
  /**
   * The app's own return link (`tayarikakshya://payment-result`, or `exp://…/--/payment-result` in Expo Go during
   * development). Used only when the server allows it; otherwise the configured app address applies.
   */
  appReturnUrl: z.string().trim().max(300).optional(),
});
export type PayOrderInput = z.infer<typeof PayOrderInput>;

export const OrderStatusName = z.enum(['pending', 'paid', 'refunded', 'expired', 'cancelled']);
export const PaymentStatusName = z.enum([
  'initiated',
  'pending',
  'completed',
  'failed',
  'cancelled',
  'expired',
]);

export const AdminOrderQuery = CursorQuery.extend({
  status: OrderStatusName.optional(),
  provider: PaymentProviderName.optional(),
  /** Order number, or the student's name or email. */
  q: z.string().trim().min(1).max(120).optional(),
  /** Only orders with a payment that needs attention (duplicate, or paid at the gateway with a different amount). */
  attention: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type AdminOrderQuery = z.infer<typeof AdminOrderQuery>;
