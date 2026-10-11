import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useCourseReviews } from '@/api/reviews';
import { ReviewCard } from '@/features/reviews/course-reviews';
import { RatingLine } from '@/features/reviews/stars';
import { useT } from '@/i18n/use-t';
import { Button } from '@/ui/button';
import { BackButton, Screen, Skeleton } from '@/ui/layout';
import { ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** All approved reviews of a course, newest first (D-066). */
export default function CourseReviewsScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useT();
  const reviews = useCourseReviews(slug);
  const rows = reviews.data?.pages.flatMap((p) => p.data) ?? [];
  const summary = reviews.data?.pages[0]?.summary ?? null;
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('reviews.title')}
        </Text>
      </View>
      {reviews.isPending ? (
        <Skeleton height={160} />
      ) : reviews.isError ? (
        <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <RatingLine rating={summary} />
          {rows.length === 0 ? (
            <Text variant="body" color="textSecondary">
              {t('reviews.none')}
            </Text>
          ) : (
            rows.map((r) => <ReviewCard key={r.id} review={r} />)
          )}
          {reviews.hasNextPage ? (
            <Button
              label={t('practice.loadMore')}
              variant="secondary"
              size="md"
              loading={reviews.isFetchingNextPage}
              onPress={() => void reviews.fetchNextPage()}
            />
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  list: { gap: 10, paddingBottom: 24 },
});
