import { CalendarDays } from 'lucide-react-native';
import { FlatList, StyleSheet, View } from 'react-native';
import { usePastChallenges } from '@/api/assessments';
import { TestRow } from '@/features/tests/test-list';
import { useT } from '@/i18n/use-t';
import { Button } from '@/ui/button';
import { BackButton, Banner, Screen, Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** Earlier daily challenges, newest first: practice that never counts for the streak or ranking (D-049). */
export default function PastChallengesScreen() {
  const { t } = useT();
  const past = usePastChallenges();
  const items = past.data?.pages.flatMap((p) => p.data) ?? [];
  const practiceAllowed = past.data?.pages[0]?.pastAsPractice ?? true;
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('daily.past')}
        </Text>
      </View>
      {past.isPending ? (
        <View style={{ gap: 10 }} aria-busy>
          <Skeleton height={76} />
          <Skeleton height={76} />
        </View>
      ) : past.isError ? (
        <ErrorState error={past.error} onRetry={() => void past.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={CalendarDays} title={t('daily.emptyPast')} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
          ListHeaderComponent={
            <Banner tone="info" message={practiceAllowed ? t('daily.pastBody') : t('daily.pastClosed')} />
          }
          renderItem={({ item }) => <TestRow a={item} />}
          ListFooterComponent={
            past.hasNextPage ? (
              <Button
                label={t('practice.loadMore')}
                variant="secondary"
                size="md"
                loading={past.isFetchingNextPage}
                onPress={() => void past.fetchNextPage()}
              />
            ) : null
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
