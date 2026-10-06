import type { LocalizedText } from '@tk/contracts';

/** Orders and payments (Phase 11). Amounts are paisa. */

export const ORDER_STATUS = {
  pending: { label: 'Not paid', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  expired: { label: 'Expired', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
} as const;
export type OrderStatus = keyof typeof ORDER_STATUS;

export const PAYMENT_STATUS = {
  initiated: { label: 'Started', tone: 'neutral' },
  pending: { label: 'Waiting for gateway', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
} as const;
export type PaymentStatus = keyof typeof PAYMENT_STATUS;

export const PROVIDER_LABEL: Record<string, string> = {
  esewa: 'eSewa',
  khalti: 'Khalti',
  connectips: 'ConnectIPS',
};

export const orderNo = (n: number) => `#${String(n).padStart(6, '0')}`;

export interface OrderRow {
  id: string;
  orderNo: number;
  status: OrderStatus;
  channel: 'android' | 'ios' | 'web';
  totalPaisa: number;
  createdAt: string;
  paidAt: string | null;
  student: { id: string; fullName: string; contact: string | null };
  items: LocalizedText[];
  lastPayment: { provider: string; status: PaymentStatus } | null;
  attention: boolean;
}

export interface OrderDetail {
  id: string;
  orderNo: number;
  status: OrderStatus;
  channel: string;
  currency: string;
  subtotalPaisa: number;
  discountPaisa: number;
  couponCode: string | null;
  couponId: string | null;
  /** VAT that applied (D-055); null when not VAT-registered at the time. */
  tax: { rateBps: number; inclusive: boolean; paisa: number } | null;
  totalPaisa: number;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  student: { id: string; fullName: string; contact: string | null };
  items: Array<{ courseId: string | null; title: LocalizedText; pricePaisa: number; validity: unknown }>;
  access: Array<{
    id: string;
    courseId: string | null;
    status: string;
    startsAt: string;
    endsAt: string | null;
    revokedReason: string | null;
  }>;
  payments: Array<{
    id: string;
    provider: string;
    status: PaymentStatus;
    amountPaisa: number;
    providerReference: string | null;
    providerTransactionId: string | null;
    duplicate: boolean;
    failureReason: string | null;
    initiatedAt: string;
    completedAt: string | null;
    lastCheckedAt: string | null;
    events: Array<{ id: string; type: string; result: string; at: string; payload: unknown }>;
  }>;
}
