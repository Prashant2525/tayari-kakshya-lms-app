import { useLocalSearchParams } from 'expo-router';
import { useCourse } from '@/api/learning';
import { CheckoutView } from '@/features/commerce/checkout-view';
import { ErrorState } from '@/ui/states';

/** Checkout for one course (Phase 11). */
export default function CourseCheckoutScreen() {
  const { slug, coupon } = useLocalSearchParams<{ slug: string; coupon?: string }>();
  const course = useCourse(slug);
  if (course.isError) return <ErrorState error={course.error} onRetry={() => void course.refetch()} />;
  const c = course.data;
  return (
    <CheckoutView
      loading={course.isPending}
      item={c ? { courseId: c.id } : null}
      alreadyHaveKey="checkout.alreadyHave"
      initialCoupon={coupon}
    />
  );
}
