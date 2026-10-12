import type { LiveWhen } from '@tk/contracts';
import { useLocalSearchParams } from 'expo-router';
import { Radio } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useLiveClasses } from '@/api/live';
import { LiveClassRow } from '@/features/live/live-card';
import { useT } from '@/i18n/use-t';
import { BackButton, Screen, Skeleton } from '@/ui/layout';
import { Segmented } from '@/ui/segmented';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** Live classes of a course (`?courseId=`), or of all the student's courses (Home), upcoming or past. */
export default function LiveClassesScreen() {
  const { t } = useT();
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const [when, setWhen] = useState<LiveWhen>('upcoming');
  const list = useLiveClasses(when, courseId);
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('live.title')}
        </Text>
      </View>
      <Segmented
        label={t('live.title')}
        value={when}
        onChange={setWhen}
        options={[
          { value: 'upcoming', label: t('live.upcoming') },
          { value: 'past', label: t('live.past') },
        ]}
      />
      {list.isPending ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={96} />
          <Skeleton height={96} />
        </View>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Radio}
          title={when === 'upcoming' ? t('live.emptyUpcoming') : t('live.emptyPast')}
          body={when === 'upcoming' ? t('live.emptyUpcomingBody') : undefined}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
          renderItem={({ item }) => <LiveClassRow live={item} showCourse={!courseId} />}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
