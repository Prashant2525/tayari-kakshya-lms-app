import { useLocalSearchParams } from 'expo-router';
import { Crown } from 'lucide-react-native';
import { usePlans } from '@/api/plans';
import { CheckoutView, validityText } from '@/features/commerce/checkout-view';
import { PricingText } from '@/features/courses/course-card';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDate } from '@/lib/dates';
import { EmptyState, ErrorState } from '@/ui/states';

/** Checkout for a plan (D-023). Buying a plan the student already has renews it: the new period starts when theirs ends (D-054). */
export default function PlanCheckoutScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, locale } = useT();
  const plans = usePlans();
  if (plans.isError) return <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />;
  const p = plans.data?.find((x) => x.slug === slug);
  if (plans.data && !p) return <EmptyState icon={Crown} title={t('plans.notFound')} />;
  return (
    <CheckoutView
      loading={plans.isPending}
      title={p ? localized(p.name, locale) : ''}
      validity={p ? validityText(p.validity, t, locale) : ''}
      note={p?.mine?.endsAt ? t('checkout.renewNote', { date: bsDate(p.mine.endsAt, locale) }) : undefined}
      price={p ? <PricingText pricing={p.pricing} /> : null}
      totalPaisa={p?.pricing?.effectivePricePaisa ?? null}
      item={p ? { planId: p.id } : null}
      alreadyHaveKey="checkout.alreadyHavePlan"
    />
  );
}
