import { useMutation, useQuery } from '@tanstack/react-query';
import type { LocalizedText } from '@tk/contracts';
import { api, queryClient } from './client';

/** Course purchases (Phase 11). The server sets every amount; the app only shows them. */

export type ProviderName = 'esewa' | 'khalti';

export interface OrderView {
  id: string;
  orderNo: number;
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  currency: string;
  totalPaisa: number;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  items: Array<{ courseId: string | null; slug: string | null; title: LocalizedText; pricePaisa: number }>;
  payments: Array<{
    id: string;
    provider: ProviderName | 'connectips';
    status: 'initiated' | 'pending' | 'completed' | 'failed' | 'cancelled' | 'expired';
    initiatedAt: string;
    completedAt: string | null;
  }>;
}

export const commerceKeys = {
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

/** Creates the order (or returns the unpaid one) and starts paying it; returns where to send the student. */
export function useCheckout() {
  return useMutation({
    mutationFn: async (input: { courseId: string; provider: ProviderName; returnTo: 'app' | 'web' }) => {
      const order = await api.post<OrderView>('/orders', { courseId: input.courseId });
      const started = await api.post<{ paymentId: string; redirectUrl: string }>(`/orders/${order.id}/pay`, {
        provider: input.provider,
        returnTo: input.returnTo,
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

/** After a purchase: course pages, My courses and orders show the new access. */
export function refreshAfterPurchase() {
  void queryClient.invalidateQueries({ queryKey: ['course'] });
  void queryClient.invalidateQueries({ queryKey: ['me', 'courses'] });
  void queryClient.invalidateQueries({ queryKey: commerceKeys.mine });
}
