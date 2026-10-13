'use server';

import { api, ApiError } from '@/lib/api';
import { serverEnv } from '@/lib/env';
import type { Failure } from '@/lib/failure';
import type { CheckoutItem, OrderStatus, OrderView, Quote } from '@/lib/types';

const failure = (err: unknown): Failure =>
  err instanceof ApiError
    ? { ok: false, code: err.code, reason: err.reason ?? null }
    : { ok: false, code: 'NETWORK', reason: null };

/** The server's price for this purchase (sale, coupon, VAT); nothing is stored. */
export async function quoteAction(
  item: CheckoutItem,
  couponCode: string | null,
): Promise<{ ok: true; quote: Quote } | Failure> {
  try {
    const quote = await api<Quote>('/orders/quote', {
      method: 'POST',
      body: { ...item, ...(couponCode ? { couponCode } : {}) },
    });
    return { ok: true, quote };
  } catch (err) {
    return failure(err);
  }
}

/**
 * Makes the order (the server prices it again) and starts paying it with the chosen gateway; returns where to send
 * the student — or nothing when a coupon left nothing to pay and the order is already paid (D-056).
 */
export async function checkoutAction(
  item: CheckoutItem,
  couponCode: string | null,
  provider: 'esewa' | 'khalti' | 'connectips' | null,
): Promise<{ ok: true; orderId: string; redirectUrl: string | null } | Failure> {
  try {
    const order = await api<OrderView>('/orders', {
      method: 'POST',
      body: { ...item, ...(couponCode ? { couponCode } : {}) },
    });
    if (order.status === 'paid') return { ok: true, orderId: order.id, redirectUrl: null };
    if (!provider) return { ok: false, code: 'PAYMENT_PROVIDER_UNAVAILABLE', reason: null };
    const started = await api<{ redirectUrl: string }>(`/orders/${order.id}/pay`, {
      method: 'POST',
      body: { provider, returnTo: 'web' },
    });
    return { ok: true, orderId: order.id, redirectUrl: started.redirectUrl };
  } catch (err) {
    return failure(err);
  }
}

/** The order's status, asked again while the payment is being confirmed. */
export async function orderStatusAction(orderId: string): Promise<OrderStatus | null> {
  try {
    return (await api<OrderView>(`/orders/${orderId}`)).status;
  } catch {
    return null;
  }
}

/** A short-lived address of the student's receipt PDF (D-057). */
export async function receiptLinkAction(orderId: string): Promise<string | null> {
  try {
    const { path } = await api<{ path: string }>(`/orders/${orderId}/receipt`);
    return `${serverEnv.apiPublicUrl}${path}`;
  } catch {
    return null;
  }
}
