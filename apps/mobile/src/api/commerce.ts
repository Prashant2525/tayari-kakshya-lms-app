import { useMutation, useQuery } from '@tanstack/react-query';
import type { LocalizedText } from '@tk/contracts';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { env } from '@/lib/env';
import { api, queryClient } from './client';

/** Course and plan purchases (Phase 11). The server sets every amount; the app only shows them. */

export type ProviderName = 'esewa' | 'khalti';

export interface OrderView {
  id: string;
  orderNo: number;
  status: 'pending' | 'paid' | 'refunded' | 'expired' | 'cancelled';
  currency: string;
  subtotalPaisa: number;
  discountPaisa: number;
  couponCode: string | null;
  tax: { rateBps: number; inclusive: boolean; paisa: number } | null;
  totalPaisa: number;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  /** The receipt, once paid (D-057). */
  receipt: { number: string } | null;
  items: Array<{
    kind: 'course' | 'plan';
    courseId: string | null;
    planId: string | null;
    /** The course's slug (course items) or the plan's (plan items). */
    slug: string | null;
    planSlug: string | null;
    title: LocalizedText;
    pricePaisa: number;
  }>;
  payments: Array<{
    id: string;
    provider: ProviderName | 'connectips';
    status: 'initiated' | 'pending' | 'completed' | 'failed' | 'cancelled' | 'expired';
    initiatedAt: string;
    completedAt: string | null;
  }>;
}

export type CheckoutItem = { courseId: string } | { planId: string };

/** The server's price for a purchase (D-025 coupon, D-055 VAT); nothing is stored until the order is made. */
export interface Quote {
  kind: 'course' | 'plan';
  title: LocalizedText;
  validity: { type: string; days: number | null; endsOn: string | null };
  /** The regular price; above `subtotalPaisa` during a sale. */
  regularPricePaisa: number;
  subtotalPaisa: number;
  discountPaisa: number;
  coupon: { code: string } | null;
  tax: { rateBps: number; inclusive: boolean; paisa: number } | null;
  totalPaisa: number;
}

export const commerceKeys = {
  quote: (item: CheckoutItem | null, coupon: string | null) => ['quote', item, coupon] as const,
  options: ['payment-options'] as const,
  order: (id: string) => ['order', id] as const,
  mine: ['my-orders'] as const,
};

export function usePaymentOptions() {
  return useQuery({
    queryKey: commerceKeys.options,
    queryFn: () =>
      api.get<{ providers: Array<{ provider: ProviderName; testMode: boolean }> }>('/payments/options'),
  });
}

const quoteOf = (item: CheckoutItem, coupon: string | null) =>
  api.post<Quote>('/orders/quote', { ...item, ...(coupon ? { couponCode: coupon } : {}) });

export function useQuote(item: CheckoutItem | null, coupon: string | null, enabled = true) {
  return useQuery({
    queryKey: commerceKeys.quote(item, coupon),
    queryFn: () => quoteOf(item!, coupon),
    enabled: Boolean(item) && enabled,
    retry: false,
  });
}

/** Asks the server whether a coupon applies; on success its quote is ready for checkout to show. */
export function useApplyCoupon(item: CheckoutItem) {
  return useMutation({
    mutationFn: (code: string) => quoteOf(item, code),
    onSuccess: (quote, code) => queryClient.setQueryData(commerceKeys.quote(item, code), quote),
  });
}

/**
 * Creates the order (or returns the unpaid one) and starts paying it; returns where to send the student — or no
 * address when a coupon left nothing to pay and the order is already paid (D-056).
 */
export function useCheckout() {
  return useMutation({
    mutationFn: async (input: {
      item: CheckoutItem;
      couponCode?: string | undefined;
      provider: ProviderName | null;
      returnTo: 'app' | 'web';
      appReturnUrl?: string;
    }): Promise<{ order: OrderView; redirectUrl: string | null }> => {
      const order = await api.post<OrderView>('/orders', {
        ...input.item,
        ...(input.couponCode ? { couponCode: input.couponCode } : {}),
      });
      if (order.status === 'paid') {
        refreshAfterPurchase();
        return { order, redirectUrl: null };
      }
      if (!input.provider) throw new Error('No payment method');
      const started = await api.post<{ paymentId: string; redirectUrl: string }>(`/orders/${order.id}/pay`, {
        provider: input.provider,
        returnTo: input.returnTo,
        ...(input.appReturnUrl ? { appReturnUrl: input.appReturnUrl } : {}),
      });
      return { order, redirectUrl: started.redirectUrl };
    },
  });
}

/** The order, polled while its payment is being confirmed. */
export function useOrder(id: string, poll: boolean) {
  return useQuery({
    queryKey: commerceKeys.order(id),
    queryFn: () => api.get<OrderView>(`/orders/${id}`),
    refetchInterval: (q) => (poll && q.state.data?.status === 'pending' ? 2500 : false),
  });
}

export function useMyOrders() {
  return useQuery({ queryKey: commerceKeys.mine, queryFn: () => api.get<OrderView[]>('/me/orders') });
}

/**
 * Opens the order's receipt PDF (D-057): the server gives a link that works for a few minutes; it opens in the
 * browser, where the student can save or share it.
 */
export function useOpenReceipt() {
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { path } = await api.get<{ path: string }>(`/orders/${orderId}/receipt`);
      const url = `${env.apiBaseUrl}${path}`;
      if (Platform.OS === 'web') globalThis.open(url, '_blank', 'noopener');
      else await WebBrowser.openBrowserAsync(url);
    },
  });
}

/** After a purchase: course pages, My courses, plans and orders show the new access. */
export function refreshAfterPurchase() {
  void queryClient.invalidateQueries({ queryKey: ['plans'] });
  void queryClient.invalidateQueries({ queryKey: ['course'] });
  void queryClient.invalidateQueries({ queryKey: ['me', 'courses'] });
  void queryClient.invalidateQueries({ queryKey: commerceKeys.mine });
}
