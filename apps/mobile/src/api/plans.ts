import { useQuery } from '@tanstack/react-query';
import type { LocalizedText } from '@tk/contracts';
import { api } from './client';
import type { Pricing } from './learning';

/** Subscription plans (D-023, D-054). Prices come from the server, and none where this platform does not sell. */
export interface PlanView {
  id: string;
  slug: string;
  name: LocalizedText;
  description: LocalizedText | null;
  features: LocalizedText[];
  coverage: 'selected' | 'all_courses';
  isFeatured: boolean;
  isFree: boolean;
  validity: { type: string; days: number | null; endsOn: string | null };
  courses: Array<{ id: string; slug: string; title: LocalizedText }>;
  pricing: Pricing | null;
  /** The student's own plan: null when they do not have it; endsAt null = no end date. */
  mine: { endsAt: string | null } | null;
}

export const planKeys = { all: ['plans'] as const };

export function usePlans() {
  return useQuery({ queryKey: planKeys.all, queryFn: () => api.get<PlanView[]>('/plans') });
}
