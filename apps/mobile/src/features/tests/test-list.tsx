import { radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { ChevronRight, ClipboardCheck } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAssessments, type AssessmentScope, type AssessmentSummary } from '@/api/assessments';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDate, bsDateTime } from '@/lib/dates';
import { marks, num } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { StatusChip } from '@/ui/chip';
import { Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** Tests for a course / subject, or for the student's exams (Home → Tests). */
export function TestList({ scope }: { scope: AssessmentScope }) {
  const { t } = useT();
  const list = useAssessments(scope);
  if (list.isPending) {
    return (
      <View style={{ gap: 10, marginTop: 14 }} aria-busy>
        <Skeleton height={76} />
        <Skeleton height={76} />
      </View>
    );
  }
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (!list.data.data.length) {
    return <EmptyState icon={ClipboardCheck} title={t('tests.empty')} body={t('tests.emptyBody')} />;
  }
  return (
    <View style={{ gap: 10, marginTop: 14 }}>
      {list.data.data.map((a) => (
        <TestRow key={a.id} a={a} />
      ))}
    </View>
  );
}

/** One test: type, title, size and time, and its state (locked, upcoming, in progress, score). */
export function TestRow({ a }: { a: AssessmentSummary }) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const meta = [
    t(`assessmentType.${a.type}`),
    a.challengeDate ? bsDate(`${a.challengeDate}T06:00:00Z`, locale) : null,
    t(a.questionCount === 1 ? 'test.question' : 'test.questions', { n: num(a.questionCount, locale) }),
    a.durationSeconds ? t('test.minutes', { n: num(Math.round(a.durationSeconds / 60), locale) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const when =
    a.state === 'upcoming' && a.opensAt
      ? t('test.opensOn', { date: bsDateTime(a.opensAt, locale) })
      : a.state === 'open' && a.closesAt
        ? t('test.closesOn', { date: bsDateTime(a.closesAt, locale) })
        : null;
  const title = localized(a.title, locale);
  return (
    <Pressable
      role="link"
      aria-label={title}
      onPress={() => router.push({ pathname: '/test/[id]', params: { id: a.id } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surfaceMuted : colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
        <ClipboardCheck size={20} color={colors.onPrimarySoft} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="h4" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="caption" color="textSecondary">
          {meta}
        </Text>
        {when ? (
          <Text variant="caption" color="textMuted">
            {when}
          </Text>
        ) : null}
        <View style={styles.chips}>
          {a.locked ? (
            <StatusChip tone="premium" label={t('item.premium')} />
          ) : a.inProgressAttemptId ? (
            <StatusChip tone="progress" label={t('test.inProgress')} />
          ) : a.result && a.result.score !== null && a.result.maxScore !== null ? (
            <StatusChip
              tone="done"
              label={t('test.score', {
                score: marks(a.result.score, locale),
                max: marks(a.result.maxScore, locale),
              })}
            />
          ) : (
            <StatusChip tone="neutral" label={t(`test.state.${a.state}`)} />
          )}
        </View>
      </View>
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { flexDirection: 'row', gap: 6, marginTop: 2 },
});
