import { radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { ChevronRight, ClipboardList } from 'lucide-react-native';
import { FlatList, StyleSheet, View } from 'react-native';
import { useAttemptHistory, type HistoryItem } from '@/api/assessments';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDate } from '@/lib/dates';
import { marks, num } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { PressableScale } from '@/ui/motion';
import { Button } from '@/ui/button';
import { BackButton, Screen, Skeleton, useSurfaceStyle } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** Profile → My test results: every attempt, newest first. */
export default function AttemptsScreen() {
  const { t } = useT();
  const history = useAttemptHistory();
  const items = history.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('history.title')}
        </Text>
      </View>
      {history.isPending ? (
        <View style={{ gap: 10 }} aria-busy>
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : history.isError ? (
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t('history.empty')} body={t('history.emptyBody')} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
          renderItem={({ item }) => <Row a={item} />}
          ListFooterComponent={
            history.hasNextPage ? (
              <Button
                label={t('practice.loadMore')}
                variant="secondary"
                size="md"
                loading={history.isFetchingNextPage}
                onPress={() => void history.fetchNextPage()}
              />
            ) : null
          }
        />
      )}
    </Screen>
  );
}

function Row({ a }: { a: HistoryItem }) {
  const { colors } = useTheme();
  const surface = useSurfaceStyle();
  const { t, locale } = useT();
  const title = localized(a.assessment.title, locale);
  const status =
    a.status === 'in_progress'
      ? t('test.inProgress')
      : a.released && a.score !== null
        ? t('test.score', { score: marks(a.score, locale), max: marks(a.maxScore, locale) })
        : t('test.resultLater');
  return (
    <PressableScale
      role="link"
      aria-label={`${title}: ${status}`}
      onPress={() =>
        a.status === 'in_progress'
          ? router.push({ pathname: '/exam/[attemptId]', params: { attemptId: a.id } })
          : router.push({ pathname: '/result/[attemptId]', params: { attemptId: a.id } })
      }
      style={[styles.row, surface]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="caption" color="textSecondary">
          {t('test.attemptN', { n: num(a.attemptNo, locale) })} · {status}
          {a.submittedAt ? ` · ${bsDate(a.submittedAt, locale)}` : ''}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: radius.md,
  },
});
