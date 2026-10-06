import { z } from 'zod';
import { CursorQuery, LocalizedText } from './common.js';
import { CoursePricingInput, Slug, StatusChangeInput } from './content.js';

/** Orders and payments (Phase 11: D-003, D-023, D-027, D-051, D-052). */
export const PaymentProviderName = z.enum(['esewa', 'khalti']);
export type PaymentProviderName = z.infer<typeof PaymentProviderName>;

/** A course or a plan (exactly one). */
export const CreateOrderInput = z
  .object({ courseId: z.uuid().optional(), planId: z.uuid().optional() })
  .refine((v) => Boolean(v.courseId) !== Boolean(v.planId), { message: 'Choose a course or a plan' });
export type CreateOrderInput = z.infer<typeof CreateOrderInput>;

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

export const OrderStatusName = z.enum(['pending', 'paid', 'expired', 'cancelled']);
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
