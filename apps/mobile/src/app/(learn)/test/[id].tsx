import { radius } from '@tk/design-tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, Lock } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  useAssessment,
  useStartAttempt,
  type AssessmentDetail,
  type AttemptSummary,
} from '@/api/assessments';
import { RichText } from '@/features/learn/rich-text';
import { docFor } from '@/features/questions/answer-input';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { errorMessageKey } from '@/lib/error-message';
import { bsDate, bsDateTime, nepalToday } from '@/lib/dates';
import { marks, num } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { PressableScale } from '@/ui/motion';
import { Button } from '@/ui/button';
import { StatusChip } from '@/ui/chip';
import { BackButton, Banner, Card, Screen, Skeleton, useSurfaceStyle } from '@/ui/layout';
import { ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** A test before starting: what it is, its rules (from the CMS), Start / Continue, and past attempts. */
export default function TestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useT();
  const test = useAssessment(id);
  const start = useStartAttempt(id);
  const begin = () =>
    start.mutate(undefined, {
      onSuccess: (attempt) =>
        router.push({ pathname: '/exam/[attemptId]', params: { attemptId: attempt.id } }),
    });

  return (
    <Screen edges={['top', 'bottom']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading" style={{ flex: 1 }} numberOfLines={2}>
          {test.data ? localized(test.data.title, locale) : ''}
        </Text>
      </View>
      {test.isPending ? (
        <View style={{ gap: 12 }} aria-busy>
          <Skeleton height={160} />
          <Skeleton height={56} />
        </View>
      ) : test.isError ? (
        <ErrorState error={test.error} onRetry={() => void test.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Rules a={test.data} />
          {start.isError ? <Banner message={t(errorMessageKey(start.error))} /> : null}
          {test.data.challengeDate && test.data.challengeDate < nepalToday() ? (
            <Banner tone="info" message={t('test.practiceNote')} />
          ) : null}
          <Action a={test.data} loading={start.isPending} onStart={begin} />
          {test.data.leaderboardEnabled ? (
            <Button
              label={t('leaderboard.see')}
              variant="secondary"
              onPress={() => router.push({ pathname: '/leaderboard/[id]', params: { id } })}
            />
          ) : null}
          {test.data.attempts.length ? <Attempts a={test.data} /> : null}
        </ScrollView>
      )}
    </Screen>
  );
}

function Rules({ a }: { a: AssessmentDetail }) {
  const { t, locale } = useT();
  const r = a.rules;
  const instructions = docFor(a.instructions, locale);
  const release =
    r.resultRelease === 'after_close' && r.releaseAt
      ? t('test.results.after_close', { date: bsDateTime(r.releaseAt, locale) })
      : t(`test.results.${r.resultRelease === 'after_close' ? 'manual' : r.resultRelease}`);
  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.chips}>
        <StatusChip tone="neutral" label={t(`assessmentType.${a.type}`)} />
        {a.accessLevel === 'premium' ? <StatusChip tone="premium" label={t('item.premium')} /> : null}
        <StatusChip tone={a.state === 'open' ? 'progress' : 'neutral'} label={t(`test.state.${a.state}`)} />
      </View>
      <Text variant="label" color="textMuted" style={styles.overline}>
        {t('test.rules')}
      </Text>
      <Rule label={t('test.rule.questions')}>{num(a.questionCount, locale)}</Rule>
      {a.totalMarks !== null ? <Rule label={t('test.rule.marks')}>{marks(a.totalMarks, locale)}</Rule> : null}
      <Rule label={t('test.rule.time')}>
        {a.durationSeconds
          ? t('test.minutes', { n: num(Math.round(a.durationSeconds / 60), locale) })
          : t('test.untimed')}
      </Rule>
      <Rule label={t('test.rule.negative')}>
        {r.negativeMarking ? t('test.rule.negativeOn') : t('test.rule.negativeOff')}
      </Rule>
      {r.passMarks !== null ? <Rule label={t('test.rule.pass')}>{marks(r.passMarks, locale)}</Rule> : null}
      <Rule label={t('test.rule.attempts')}>
        {a.maxAttempts === null
          ? t('test.rule.attemptsUnlimited', { used: num(a.attemptsUsed, locale) })
          : t('test.rule.attemptsOf', { used: num(a.attemptsUsed, locale), max: num(a.maxAttempts, locale) })}
      </Rule>
      <Rule label={t('test.rule.results')}>{release}</Rule>
      {a.opensAt && a.state === 'upcoming' ? (
        <Text variant="bodySm">{t('test.opensOn', { date: bsDateTime(a.opensAt, locale) })}</Text>
      ) : null}
      {a.closesAt && a.state === 'open' ? (
        <Text variant="bodySm">
          {r.lateStart === 'until_close'
            ? t('test.endsAtClose', { date: bsDateTime(a.closesAt, locale) })
            : t('test.closesOn', { date: bsDateTime(a.closesAt, locale) })}
        </Text>
      ) : null}
      {a.durationSeconds ? (
        <Text variant="caption" color="textSecondary">
          {t('test.timeNote')}
        </Text>
      ) : null}
      {instructions ? <RichText doc={instructions} media={{}} scale={0.94} /> : null}
    </Card>
  );
}

function Rule({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.rule}>
      <Text variant="bodySm" color="textSecondary" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="label" style={{ flex: 1.4, textAlign: 'right' }}>
        {children}
      </Text>
    </View>
  );
}

function Action({ a, loading, onStart }: { a: AssessmentDetail; loading: boolean; onStart: () => void }) {
  const { colors } = useTheme();
  const { t } = useT();
  if (a.locked) {
    return (
      <View style={[styles.locked, { borderColor: colors.borderStrong }]}>
        <Lock size={20} color={colors.warning} strokeWidth={1.75} />
        <Text variant="bodySm" style={{ flex: 1 }}>
          {t('test.locked')}
        </Text>
      </View>
    );
  }
  if (a.inProgressAttemptId) return <Button label={t('test.resume')} loading={loading} onPress={onStart} />;
  if (a.state === 'closed') return <Banner tone="info" message={t('test.closedNote')} />;
  if (a.state === 'upcoming') return null;
  if (a.maxAttempts !== null && a.attemptsUsed >= a.maxAttempts) {
    return <Banner tone="info" message={t('test.noAttemptsLeft')} />;
  }
  return (
    <Button label={a.attemptsUsed ? t('test.retake') : t('test.start')} loading={loading} onPress={onStart} />
  );
}

function Attempts({ a }: { a: AssessmentDetail }) {
  const { t } = useT();
  return (
    <View style={{ gap: 8 }}>
      <Text variant="h4" role="heading">
        {t('test.yourAttempts')}
      </Text>
      {[...a.attempts].reverse().map((attempt) => (
        <AttemptRow key={attempt.id} attempt={attempt} releaseAt={a.rules.releaseAt} />
      ))}
    </View>
  );
}

function AttemptRow({ attempt, releaseAt }: { attempt: AttemptSummary; releaseAt: string | null }) {
  const { colors } = useTheme();
  const surface = useSurfaceStyle();
  const { t, locale } = useT();
  const label = t('test.attemptN', { n: num(attempt.attemptNo, locale) });
  const status =
    attempt.status === 'in_progress'
      ? t('test.inProgress')
      : attempt.released && attempt.score !== null
        ? t('test.score', { score: marks(attempt.score, locale), max: marks(attempt.maxScore, locale) })
        : releaseAt
          ? t('test.resultOn', { date: bsDate(releaseAt, locale) })
          : t('test.resultLater');
  const open = () =>
    attempt.status === 'in_progress'
      ? router.push({ pathname: '/exam/[attemptId]', params: { attemptId: attempt.id } })
      : router.push({ pathname: '/result/[attemptId]', params: { attemptId: attempt.id } });
  return (
    <PressableScale
      role="link"
      aria-label={`${label}: ${status}`}
      onPress={open}
      style={[styles.attempt, surface]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">{label}</Text>
        <Text variant="caption" color="textSecondary">
          {status}
          {attempt.submittedAt ? ` · ${bsDate(attempt.submittedAt, locale)}` : ''}
        </Text>
      </View>
      {attempt.counted && attempt.released ? <StatusChip tone="done" label={t('test.official')} /> : null}
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  body: { gap: 14, paddingBottom: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  overline: { textTransform: 'uppercase', letterSpacing: 0.4 },
  rule: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
  },
  attempt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderRadius: radius.md,
  },
});
