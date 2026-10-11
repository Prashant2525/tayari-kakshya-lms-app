import { radius } from '@tk/design-tokens';
import { router, useFocusEffect } from 'expo-router';
import { Megaphone, Pin } from 'lucide-react-native';
import { useCallback } from 'react';
import { Animated, RefreshControl, StyleSheet, View } from 'react-native';
import { markNoticesSeen, useNotices, type NoticeRow } from '@/api/notices';
import { KIND_KEY } from '@/features/notices/kinds';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDate } from '@/lib/dates';
import { useTheme } from '@/theme/theme';
import { StatusChip } from '@/ui/chip';
import { Screen, Skeleton, useSurfaceStyle } from '@/ui/layout';
import { FadeInUp, PressableScale } from '@/ui/motion';
import { CompactBar, LargeTitle, useScrollMotion } from '@/ui/scroll-header';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

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

function NoticeCard({ n }: { n: NoticeRow }) {
  const { colors } = useTheme();
  const surface = useSurfaceStyle();
  const { t, locale } = useT();
  const title = localized(n.title, locale);
  return (
    <PressableScale
      role="link"
      aria-label={title}
      onPress={() => router.push({ pathname: '/notice/[id]', params: { id: n.id } })}
      style={[styles.card, surface]}
    >
      <View style={styles.meta}>
        <StatusChip tone={n.kind === 'official' ? 'official' : 'neutral'} label={t(KIND_KEY[n.kind])} />
        {n.isPinned ? (
          <Pin size={16} color={colors.textSecondary} strokeWidth={1.75} aria-label={t('notices.pinned')} />
        ) : null}
        <Text variant="caption" color="textMuted" style={{ marginLeft: 'auto' }}>
          {bsDate(n.publishedAt, locale)}
        </Text>
      </View>
      <Text variant="h4">{title}</Text>
      <Text variant="bodySm" color="textSecondary" numberOfLines={3}>
        {localized(n.summary, locale)}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 20, gap: 14 },
  // The list scrolls under the compact bar with its title inside, edge to edge.
  contentList: { paddingTop: 0, paddingHorizontal: 0 },
  list: { gap: 10, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
