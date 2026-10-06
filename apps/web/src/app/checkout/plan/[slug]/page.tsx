import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Checkout } from '@/components/checkout';
import { Alert } from '@/components/ui';
import { api } from '@/lib/api';
import { prepareCheckout } from '@/lib/checkout';
import { getI18n } from '@/lib/i18n';
import type { PlanView } from '@/lib/types';
import { validityText } from '@/lib/validity';

export const metadata: Metadata = { robots: { index: false } };

/** Checkout for a plan (D-023); buying one the student has renews it after the current period (D-054). */
export default async function PlanCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ coupon?: string }>;
}) {
  const { slug } = await params;
  const { coupon } = await searchParams;
  const here = `/checkout/plan/${slug}${coupon ? `?coupon=${encodeURIComponent(coupon)}` : ''}`;
  const plan = (await api<PlanView[]>('/plans')).find((p) => p.slug === slug);
  if (!plan) notFound();
  const ready = await prepareCheckout({ planId: plan.id }, here, coupon, 'checkout.alreadyHavePlan');
  const { t, localized, bsDate } = await getI18n();
  if (!ready.ok) {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="mb-4 text-3xl font-bold text-text">{t('checkout.title')}</h1>
        <Alert tone="info">{ready.message}</Alert>
      </div>
    );
  }
  return (
    <Checkout
      item={{ planId: plan.id }}
      title={localized(plan.name)}
      validity={validityText(ready.quote.validity, t, bsDate)}
      note={plan.mine?.endsAt ? t('checkout.renewNote', { date: bsDate(plan.mine.endsAt) }) : undefined}
      initialQuote={ready.quote}
      linkError={ready.linkError}
      providers={ready.providers}
      alreadyHaveKey="checkout.alreadyHavePlan"
    />
  );
}
