import { useLocalSearchParams } from 'expo-router';
import { useCourse } from '@/api/learning';
import { CheckoutView, validityText } from '@/features/commerce/checkout-view';
import { PriceText } from '@/features/courses/course-card';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { ErrorState } from '@/ui/states';

/** Checkout for one course (Phase 11). */
export default function CourseCheckoutScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, locale } = useT();
  const course = useCourse(slug);
  if (course.isError) return <ErrorState error={course.error} onRetry={() => void course.refetch()} />;
  const c = course.data;
  return (
    <CheckoutView
      loading={course.isPending}
      title={c ? localized(c.title, locale) : ''}
      validity={c ? validityText(c.validity, t, locale) : ''}
      price={c ? <PriceText course={c} /> : null}
      totalPaisa={c?.pricing?.effectivePricePaisa ?? null}
      item={c ? { courseId: c.id } : null}
      alreadyHaveKey="checkout.alreadyHave"
    />
  );
}
