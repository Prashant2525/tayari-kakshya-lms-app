import { z } from 'zod';
import { CursorQuery } from './common.js';

/** Orders and payments (Phase 11: D-003, D-023, D-027, D-051, D-052). */
export const PaymentProviderName = z.enum(['esewa', 'khalti']);
export type PaymentProviderName = z.infer<typeof PaymentProviderName>;

export const CreateOrderInput = z.object({ courseId: z.uuid() });
export type CreateOrderInput = z.infer<typeof CreateOrderInput>;

/** `returnTo`: where the student lands after paying — the app (deep link) or the website (both allow-listed). */
export const PayOrderInput = z.object({
  provider: PaymentProviderName,
  returnTo: z.enum(['app', 'web']),
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
