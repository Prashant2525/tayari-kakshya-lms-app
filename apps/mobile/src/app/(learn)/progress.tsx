import type { AnswerTally, StudyActivity, StudyDay, TopicStanding } from '@tk/contracts';
import { radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useProgress } from '@/api/progress';
import { studyDuration } from '@/features/progress/duration';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDate, kathmanduWeekday } from '@/lib/dates';
import { num } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { ProgressBar, StatusChip } from '@/ui/chip';
import { BackButton, Card, Screen, Skeleton } from '@/ui/layout';
import { ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

const ACTIVITIES: StudyActivity[] = ['video', 'reading', 'practice', 'test'];
const total = (d: StudyDay) => ACTIVITIES.reduce((sum, a) => sum + d.seconds[a], 0);
/** Midday in Nepal on a `YYYY-MM-DD` Nepal day, for its weekday. */
const middayOf = (day: string) => new Date(`${day}T06:15:00Z`);

/**
 * Profile / Home → My progress (S8, D-066): study time over the last week, finished lessons, accuracy overall and by
 * subject, weak and strong topics (CMS thresholds) and recent released test results.
 */
export default function ProgressScreen() {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const progress = useProgress();
  const p = progress.data;
  const time = (s: number) => studyDuration(s, t, locale);
  const pct = (n: number) => num(n, locale);

  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('progress.title')}
        </Text>
      </View>
      {progress.isPending ? (
        <View style={{ gap: 12 }} aria-busy>
          <Skeleton height={200} />
          <Skeleton height={140} />
        </View>
      ) : progress.isError ? (
        <ErrorState error={progress.error} onRetry={() => void progress.refetch()} />
      ) : p ? (
        <ScrollView contentContainerStyle={styles.list}>
          <Card style={{ gap: 12 }}>
            <Text variant="h4" role="heading">
              {t('progress.studyTime')}
            </Text>
            <View style={styles.stats}>
              <Stat label={t('progress.today')} value={time(p.studyTime.todaySeconds)} />
              <Stat label={t('progress.week')} value={time(p.studyTime.weekSeconds)} />
              <Stat label={t('progress.month')} value={time(p.studyTime.monthSeconds)} />
            </View>
            <WeekChart days={p.studyTime.days} />
            <Text variant="bodySm" color="textSecondary">
              {ACTIVITIES.map(
                (a) =>
                  `${t(`progress.activity.${a}`)} ${time(p.studyTime.days.reduce((sum, d) => sum + d.seconds[a], 0))}`,
              ).join(' · ')}
            </Text>
            <Text variant="caption" color="textMuted">
              {t('progress.studyHint')}
            </Text>
          </Card>

          <Card style={{ gap: 4 }}>
            <Text variant="h4" role="heading">
              {t('progress.lessons')}
            </Text>
            <Text variant="body">
              {t('progress.lessonsLine', {
                week: num(p.lessons.finishedThisWeek, locale),
                total: num(p.lessons.finished, locale),
              })}
            </Text>
          </Card>

          <Card style={{ gap: 10 }}>
            <Text variant="h4" role="heading">
              {t('progress.accuracy')}
            </Text>
            {p.accuracy.accuracy == null ? (
              <Text variant="body" color="textSecondary">
                {t('progress.noAnswers')}
              </Text>
            ) : (
              <>
                <Text
                  variant="h1"
                  weight={700}
                  aria-label={`${t('progress.accuracy')} ${pct(p.accuracy.accuracy)}%`}
                >
                  {pct(p.accuracy.accuracy)}%
                </Text>
                <Text variant="bodySm" color="textSecondary">
                  {counts(p.accuracy, t, locale)}
                </Text>
              </>
            )}
            <Text variant="caption" color="textMuted">
              {t('progress.accuracyWindow', { days: num(p.windowDays, locale) })}
            </Text>
          </Card>

          {p.subjects.length ? (
            <Card style={{ gap: 12 }}>
              <Text variant="h4" role="heading">
                {t('progress.bySubject')}
              </Text>
              {p.subjects.map((s) => (
                <View key={s.subjectId} style={{ gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text variant="label" style={{ flex: 1 }}>
                      {localized(s.subject, locale)}
                    </Text>
                    <Text variant="bodySm" color="textSecondary">
                      {t('progress.subjectLine', {
                        percent: pct(s.accuracy ?? 0),
                        n: num(s.answered, locale),
                      })}
                    </Text>
                  </View>
                  <ProgressBar value={s.accuracy ?? 0} label={localized(s.subject, locale)} />
                </View>
              ))}
            </Card>
          ) : null}

          <TopicCard
            title={t('progress.weak')}
            hint={t('progress.weakHint', {
              percent: pct(p.thresholds.weakBelow),
              n: num(p.thresholds.minAnswers, locale),
            })}
            topics={p.weakTopics}
            tone="weak"
            action={
              p.weakTopics.length ? (
                <Button
                  label={t('progress.revise')}
                  variant="secondary"
                  size="md"
                  onPress={() => router.push('/mistakes')}
                />
              ) : null
            }
          />
          <TopicCard
            title={t('progress.strong')}
            hint={t('progress.strongHint', {
              percent: pct(p.thresholds.strongFrom),
              n: num(p.thresholds.minAnswers, locale),
            })}
            topics={p.strongTopics}
            tone="strong"
          />

          <Card style={{ gap: 4 }}>
            <Text variant="h4" role="heading">
              {t('progress.tests')}
            </Text>
            {p.tests.length === 0 ? (
              <Text variant="body" color="textSecondary">
                {t('progress.noTests')}
              </Text>
            ) : (
              p.tests.map((a) => (
                <Pressable
                  key={a.attemptId}
                  role="link"
                  aria-label={`${localized(a.title, locale)}, ${pct(a.percent)}%`}
                  onPress={() =>
                    router.push({ pathname: '/result/[attemptId]', params: { attemptId: a.attemptId } })
                  }
                  style={({ pressed }) => [
                    styles.testRow,
                    {
                      borderTopColor: colors.border,
                      backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
                    },
                  ]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="label">{localized(a.title, locale)}</Text>
                    <Text variant="caption" color="textMuted">
                      {bsDate(a.submittedAt, locale)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text variant="h4">{pct(a.percent)}%</Text>
                    {a.passed != null ? (
                      <StatusChip
                        tone={a.passed ? 'done' : 'neutral'}
                        label={a.passed ? t('result.passed') : t('result.failed')}
                      />
                    ) : null}
                  </View>
                  <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />
                </Pressable>
              ))
            )}
          </Card>
        </ScrollView>
      ) : null}
    </Screen>
  );
}

function counts(a: AnswerTally, t: ReturnType<typeof useT>['t'], locale: 'en' | 'ne') {
  return t('progress.counts', {
    correct: num(a.correct, locale),
    partial: num(a.partial, locale),
    wrong: num(a.wrong, locale),
  });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="h4">{value}</Text>
    </View>
  );
}

/** Seven bars, today last; each bar is announced with its day and time. */
function WeekChart({ days }: { days: StudyDay[] }) {
  const { t, locale } = useT();
  const { colors } = useTheme();
  // At least half an hour of scale, so a few minutes do not fill the chart.
  const max = Math.max(1800, ...days.map(total));
  return (
    <View style={styles.chart}>
      {days.map((d, i) => {
        const weekday = kathmanduWeekday(middayOf(d.day), locale);
        const short = locale === 'ne' ? weekday.replace(/बार$/, '') : weekday.slice(0, 3);
        const seconds = total(d);
        return (
          <View
            key={d.day}
            style={styles.barColumn}
            role="img"
            aria-label={t('progress.dayBar', { day: weekday, time: studyDuration(seconds, t, locale) })}
          >
            <View style={[styles.barTrack, { backgroundColor: colors.surfaceMuted }]}>
              <View
                style={[
                  styles.bar,
                  {
                    height: `${Math.round((seconds / max) * 100)}%`,
                    backgroundColor: i === days.length - 1 ? colors.primary : colors.onPrimarySoft,
                    opacity: seconds > 0 ? 1 : 0,
                  },
                ]}
              />
            </View>
            <Text variant="caption" color={i === days.length - 1 ? 'text' : 'textMuted'} numberOfLines={1}>
              {short}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function TopicCard({
  title,
  hint,
  topics,
  tone,
  action,
}: {
  title: string;
  hint: string;
  topics: TopicStanding[];
  tone: 'weak' | 'strong';
  action?: React.ReactNode;
}) {
  const { t, locale } = useT();
  const { colors } = useTheme();
  return (
    <Card style={{ gap: 8 }}>
      <Text variant="h4" role="heading">
        {title}
      </Text>
      <Text variant="caption" color="textMuted">
        {hint}
      </Text>
      {topics.length === 0 ? (
        <Text variant="body" color="textSecondary">
          {t('progress.noTopics')}
        </Text>
      ) : (
        topics.map((tp) => (
          <View key={tp.topicId} style={[styles.topicRow, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text variant="label">{localized(tp.topic, locale)}</Text>
              <Text variant="caption" color="textMuted">
                {localized(tp.subject, locale)} ·{' '}
                {t('progress.subjectLine', {
                  percent: num(tp.accuracy ?? 0, locale),
                  n: num(tp.answered, locale),
                })}
              </Text>
            </View>
            <View
              style={[
                styles.pill,
                { backgroundColor: tone === 'weak' ? colors.warningSoft : colors.successSoft },
              ]}
            >
              <Text variant="label" style={{ color: tone === 'weak' ? colors.warning : colors.success }}>
                {num(tp.accuracy ?? 0, locale)}%
              </Text>
            </View>
          </View>
        ))
      )}
      {action}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  list: { gap: 12, paddingBottom: 24 },
  stats: { flexDirection: 'row', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chart: { flexDirection: 'row', gap: 6, height: 120, alignItems: 'flex-end' },
  barColumn: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  barTrack: {
    flex: 1,
    width: '70%',
    justifyContent: 'flex-end',
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  bar: { width: '100%', borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm, minHeight: 2 },
  testRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1 },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, borderTopWidth: 1 },
  pill: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 2 },
});
