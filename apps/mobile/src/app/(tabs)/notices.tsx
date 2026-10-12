import { useFocusEffect } from 'expo-router';
import { Megaphone } from 'lucide-react-native';
import { useCallback } from 'react';
import { Animated, RefreshControl, StyleSheet, View } from 'react-native';
import { markNoticesSeen, useNotices } from '@/api/notices';
import { NoticeCard } from '@/features/notices/notice-card';
import { useT } from '@/i18n/use-t';
import { Screen, Skeleton } from '@/ui/layout';
import { FadeInUp } from '@/ui/motion';
import { CompactBar, LargeTitle, useScrollMotion } from '@/ui/scroll-header';
import { EmptyState, ErrorState } from '@/ui/states';

/** Notices (D-019): official exam notices, announcements and instructor messages from the CMS; pinned ones first. */
export default function NoticesScreen() {
  const { t } = useT();
  const notices = useNotices();
  // Opening the tab clears its "new" badge.
  useFocusEffect(
    useCallback(() => {
      void markNoticesSeen();
    }, []),
  );
  const rows = notices.data?.pages.flatMap((p) => p.data) ?? [];
  const { scrollY, ...scroll } = useScrollMotion();
  const title = <LargeTitle title={t('notices.title')} scrollY={scrollY} />;
  const list = notices.isSuccess && rows.length > 0;
  return (
    <Screen edges={['top']} contentStyle={[styles.content, list && styles.contentList]}>
      {list ? null : title}
      {notices.isPending ? (
        <View style={{ gap: 10 }} aria-busy>
          <Skeleton height={96} />
          <Skeleton height={96} />
        </View>
      ) : notices.isError ? (
        <ErrorState error={notices.error} onRetry={() => void notices.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Megaphone} title={t('notices.empty')} body={t('notices.emptyBody')} />
      ) : (
        <Animated.FlatList
          data={rows}
          keyExtractor={(n) => n.id}
          ListHeaderComponent={title}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <FadeInUp index={index}>
              <NoticeCard n={item} />
            </FadeInUp>
          )}
          {...scroll}
          onEndReached={() => notices.hasNextPage && void notices.fetchNextPage()}
          refreshControl={
            <RefreshControl refreshing={notices.isRefetching} onRefresh={() => void notices.refetch()} />
          }
        />
      )}
      {list ? <CompactBar title={t('notices.title')} scrollY={scrollY} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 20, gap: 14 },
  // The list scrolls under the compact bar with its title inside, edge to edge.
  contentList: { paddingTop: 0, paddingHorizontal: 0 },
  list: { gap: 10, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
});
