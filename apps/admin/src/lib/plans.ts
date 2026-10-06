import type { LocalizedText, PublishStatus } from '@tk/contracts';
import type { PricingValue } from '@/components/commerce/pricing-card';

/** Subscription plans (D-023, D-054). */

export const COVERAGE_LABEL = {
  selected: 'Chosen courses',
  all_courses: 'All courses (including new ones)',
} as const;
export type Coverage = keyof typeof COVERAGE_LABEL;

export interface PlanRow {
  id: string;
  slug: string;
  name: LocalizedText;
  status: PublishStatus;
  publishAt: string | null;
  coverage: Coverage;
  pricePaisa: number;
  effectivePricePaisa: number;
  courseCount: number;
  activeSubscribers: number;
  sortOrder: number;
}

export interface PlanDetail {
  id: string;
  slug: string;
  name: LocalizedText;
  description: LocalizedText | null;
  features: LocalizedText[];
  coverage: Coverage;
  isFeatured: boolean;
  sortOrder: number;
  status: PublishStatus;
  publishAt: string | null;
  pricing: PricingValue;
  courseIds: string[];
  activeSubscribers: number;
}
