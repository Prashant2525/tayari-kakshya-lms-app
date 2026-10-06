import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Checkout } from '@/components/checkout';
import { Alert } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { prepareCheckout } from '@/lib/checkout';
import { getI18n } from '@/lib/i18n';
import type { CourseDetail } from '@/lib/types';
import { validityText } from '@/lib/validity';

export const metadata: Metadata = { robots: { index: false } };

/** Checkout for one course; `?coupon=CODE` comes from a share link (D-056). */
export default async function CourseCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ coupon?: string }>;
}) {
  const { slug } = await params;
  const { coupon } = await searchParams;
  const here = `/checkout/${slug}${coupon ? `?coupon=${encodeURIComponent(coupon)}` : ''}`;
  const course = await api<CourseDetail>(`/courses/${encodeURIComponent(slug)}`).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const ready = await prepareCheckout({ courseId: course.id }, here, coupon, 'checkout.alreadyHave');
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
      item={{ courseId: course.id }}
      title={localized(course.title)}
      validity={validityText(ready.quote.validity, t, bsDate)}
      initialQuote={ready.quote}
      linkError={ready.linkError}
      providers={ready.providers}
      alreadyHaveKey="checkout.alreadyHave"
    />
  );
}
