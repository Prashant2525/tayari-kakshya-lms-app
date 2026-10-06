import { radius } from '@tk/design-tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { Hourglass } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAttemptResult, type AttemptResult } from '@/api/assessments';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDateTime } from '@/lib/dates';
import { formatDuration, marks, num, percent } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { StatusChip } from '@/ui/chip';
import { BackButton, Banner, Card, Screen, Skeleton } from '@/ui/layout';
import { ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** Result (DESIGN_SYSTEM §8): score ring, pass/fail, counts, time, sections — or when results will be released. */
export default function ResultScreen() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const { t, locale } = useT();
  const result = useAttemptResult(attemptId);
  const back = (r: AttemptResult) =>
    router.replace({ pathname: '/test/[id]', params: { id: r.assessment.id } });
  return (
    <Screen edges={['top', 'bottom']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading" style={{ flex: 1 }} numberOfLines={2}>
          {result.data ? localized(result.data.assessment.title, locale) : t('result.title')}
        </Text>
      </View>
      {result.isPending ? (
        <View style={{ gap: 12 }} aria-busy>
          <Skeleton height={220} />
          <Skeleton height={80} />
        </View>
      ) : result.isError ? (
        <ErrorState error={result.error} onRetry={() => void result.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {result.data.autoSubmitted ? <Banner tone="info" message={t('result.autoSubmitted')} /> : null}
          {result.data.practice ? <Banner tone="info" message={t('result.practice')} /> : null}
          {result.data.released && result.data.summary ? (
            <Released r={result.data} />
          ) : (
            <Waiting r={result.data} />
          )}
          <Button label={t('result.backToTest')} variant="secondary" onPress={() => back(result.data)} />
        </ScrollView>
      )}
    </Screen>
  );
}

function Waiting({ r }: { r: AttemptResult }) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  return (
    <Card style={styles.waiting}>
      <Hourglass size={36} color={colors.onPrimarySoft} strokeWidth={1.5} />
      <Text variant="h4" align="center">
        {t('result.submitted')}
      </Text>
      <Text variant="body" color="textSecondary" align="center">
        {r.releaseAt
          ? t('result.waitDate', { date: bsDateTime(r.releaseAt, locale) })
          : t('result.waitManual')}
      </Text>
    </Card>
  );
}

function Released({ r }: { r: AttemptResult }) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const s = r.summary!;
  const score = s.score ?? 0;
  const pct = s.maxScore > 0 ? Math.max(0, percent(score, s.maxScore)) : 0;
  const counts: Array<[string, number]> = [
    [t('result.correct'), s.correct],
    [t('result.wrong'), s.wrong],
    [t('result.skipped'), s.skipped],
    ...(s.partial ? ([[t('result.partial'), s.partial]] as Array<[string, number]>) : []),
    ...(s.pending ? ([[t('result.pending'), s.pending]] as Array<[string, number]>) : []),
  ];
  return (
    <>
      <Card style={styles.scoreCard}>
        <Text variant="label" color="textSecondary">
          {t('result.score')}
        </Text>
        <ScoreRing
          value={pct}
          label={`${marks(score, locale)}`}
          sub={t('result.outOf', { max: marks(s.maxScore, locale) })}
        />
        <View style={styles.chips}>
          {s.passed !== null ? (
            <StatusChip
              tone={s.passed ? 'done' : 'neutral'}
              label={s.passed ? t('result.passed') : t('result.failed')}
            />
          ) : null}
          {r.counted ? <StatusChip tone="progress" label={t('test.official')} /> : null}
          {r.rank ? (
            <StatusChip
              tone="done"
              label={t('result.rank', { rank: num(r.rank.rank, locale), total: num(r.rank.total, locale) })}
            />
          ) : null}
        </View>
        {r.timeTakenSeconds !== null ? (
          <Text variant="bodySm" color="textSecondary">
            {t('result.time', { time: formatDuration(r.timeTakenSeconds, locale) })}
          </Text>
        ) : null}
        <View style={styles.counts}>
          {counts.map(([label, n]) => (
            <View key={label} style={[styles.count, { backgroundColor: colors.surfaceMuted }]}>
              <Text variant="h3">{num(n, locale)}</Text>
              <Text variant="caption" color="textSecondary">
                {label}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {r.canSelfGrade ? (
        <Card style={{ gap: 8 }}>
          <Text variant="h4">{t('result.selfGradeTitle')}</Text>
          <Text variant="bodySm" color="textSecondary">
            {t('result.selfGradeBody')}
          </Text>
        </Card>
      ) : s.pending ? (
        <Banner tone="info" message={t('result.awaitingTeacher')} />
      ) : null}

      {r.sections.length > 1 ? (
        <Card style={{ gap: 10 }}>
          <Text variant="h4" role="heading">
            {t('result.sections')}
          </Text>
          {r.sections.map((sec, i) => (
            <View key={i} style={styles.section}>
              <Text variant="bodySm" style={{ flex: 1 }}>
                {sec.title ? localized(sec.title, locale) : t('exam.section', { n: num(i + 1, locale) })}
              </Text>
              <Text variant="label">
                {marks(sec.score, locale)} / {marks(sec.maxScore, locale)}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      <Button
        label={r.canSelfGrade ? t('result.selfGradeTitle') : t('result.review')}
        onPress={() => router.push({ pathname: '/review/[attemptId]', params: { attemptId: r.id } })}
      />
      {r.assessment.leaderboardEnabled ? (
        <Button
          label={t('leaderboard.see')}
          variant="secondary"
          onPress={() => router.push({ pathname: '/leaderboard/[id]', params: { id: r.assessment.id } })}
        />
      ) : null}
      {/* Completed tests send their mistakes to the notebook (D-050). */}
      {r.summary && r.summary.pending === 0 && r.summary.wrong + r.summary.partial > 0 ? (
        <Button label={t('mistakes.revise')} variant="secondary" onPress={() => router.push('/mistakes')} />
      ) : null}
    </>
  );
}

/** Percentage ring with the score in the middle (no animation: calm focus, DESIGN_SYSTEM §1). */
function ScoreRing({ value, label, sub }: { value: number; label: string; sub: string }) {
  const { colors } = useTheme();
  const size = 168;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label} ${sub}`}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.surfaceMuted}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.primary}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(c * value) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text variant="h1" style={{ fontVariant: ['tabular-nums'] }}>
        {label}
      </Text>
      <Text variant="caption" color="textSecondary">
        {sub}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  body: { gap: 14, paddingBottom: 24 },
  waiting: { alignItems: 'center', gap: 10, paddingVertical: 28 },
  scoreCard: { alignItems: 'center', gap: 12, paddingVertical: 20 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignSelf: 'stretch' },
  count: { minWidth: 84, flexGrow: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md },
  section: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
