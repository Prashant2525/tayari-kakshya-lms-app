import { useQuery } from '@tanstack/react-query';
import { api } from './client';

/** "Invite friends" (D-058): the student's code, what friends and they get, and their reward coupons. */
export interface ReferralView {
  enabled: boolean;
  code: string | null;
  link: string | null;
  friendDiscount: Discount | null;
  reward: (Discount & { validDays: number | null }) | null;
  joined: number;
  rewarded: number;
  rewards: Array<
    Discount & { code: string; endsAt: string | null; state: 'available' | 'used' | 'expired' | 'cancelled' }
  >;
}

export interface Discount {
  type: 'percent' | 'fixed';
  percentBps: number | null;
  amountPaisa: number | null;
  maxDiscountPaisa: number | null;
}

export function useReferral() {
  return useQuery({ queryKey: ['me', 'referral'], queryFn: () => api.get<ReferralView>('/me/referral') });
}
