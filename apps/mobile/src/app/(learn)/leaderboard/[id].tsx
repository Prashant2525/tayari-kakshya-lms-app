import { radius } from '@tk/design-tokens';
import { useLocalSearchParams } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { FlatList, StyleSheet, View } from 'react-native';
import { useLeaderboard, type Leaderboard } from '@/api/assessments';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { formatDuration, marks, num } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { BackButton, Banner, Card, Screen, Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** Ranks of one test (official attempts, D-048; names per the CMS setting, D-049). */
export default function LeaderboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useT();
  const board = useLeaderboard(id);
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <View style={{ flex: 1 }}>
          <Text variant="h3" role="heading">
            {t('leaderboard.title')}
          </Text>
          {board.data ? (
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {localized(board.data.assessment.title, locale)}
            </Text>
          ) : null}
        </View>
      </View>
      {board.isPending ? (
        <View style={{ gap: 10 }} aria-busy>
          <Skeleton height={72} />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </View>
      ) : board.isError ? (
        <ErrorState error={board.error} onRetry={() => void board.refetch()} />
      ) : !board.data.released ? (
        <Banner tone="info" message={t('leaderboard.hidden')} />
      ) : (
        <Board b={board.data} />
      )}
    </Screen>
  );
}

function Board({ b }: { b: Leaderboard }) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  return (
    <FlatList
      data={b.top}
      keyExtractor={(e, i) => `${e.rank}-${i}`}
      contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 4 }}>
          <Card style={styles.mine}>
            <Trophy size={24} color={colors.onPrimarySoft} strokeWidth={1.75} />
            <Text variant="h4" style={{ flex: 1 }}>
              {b.me
                ? t('leaderboard.yourRank', { rank: num(b.me.rank, locale), total: num(b.total, locale) })
                : t('leaderboard.notRanked')}
            </Text>
          </Card>
          {b.names === 'none' ? (
            <Text variant="caption" color="textMuted">
              {t('leaderboard.namesHidden')}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        b.names === 'none' ? null : <EmptyState icon={Trophy} title={t('leaderboard.empty')} />
      }
      renderItem={({ item }) => (
        <View
          style={[
            styles.row,
            {
              backgroundColor: item.me ? colors.primarySoft : colors.surface,
              borderColor: item.me ? colors.primary : colors.border,
            },
          ]}
        >
          <Text variant="h4" style={styles.rank}>
            {num(item.rank, locale)}
          </Text>
          <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
            {item.me ? t('leaderboard.you') : item.name}
          </Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="label">{marks(item.score, locale)}</Text>
            <Text variant="caption" color="textMuted">
              {formatDuration(item.timeTakenSeconds, locale)}
            </Text>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    minHeight: 56,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  rank: { width: 36, fontVariant: ['tabular-nums'] },
});
