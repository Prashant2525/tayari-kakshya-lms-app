import { router } from 'expo-router';
import { CalendarCheck, ChevronRight } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useStudyPlans } from '@/api/planner';
import { examDateLabel } from '@/features/planner/days';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { num } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { StatusChip } from '@/ui/chip';
import { BackButton, Card, Screen, Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** Profile / Home → Study planner (S7, D-066): one plan per course, with today's progress. */
export default function PlannerScreen() {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const plans = useStudyPlans();

  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading" style={{ flex: 1 }}>
          {t('planner.title')}
        </Text>
      </View>
      {plans.isPending ? (
        <Skeleton height={140} />
      ) : plans.isError ? (
        <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
      ) : plans.data.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title={t('planner.empty')}
          body={t('planner.intro')}
          action={<Button label={t('planner.new')} onPress={() => router.push('/planner/edit')} />}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {plans.data.map((p) => {
            const tasks = p.today?.tasks ?? [];
            const done = tasks.filter((x) => x.done).length;
            return (
              <Pressable
                key={p.courseId}
                role="link"
                aria-label={localized(p.course.title, locale)}
                onPress={() =>
                  router.push({ pathname: '/planner/[courseId]', params: { courseId: p.courseId } })
                }
              >
                <Card style={{ gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text variant="h4" style={{ flex: 1 }}>
                      {localized(p.course.title, locale)}
                    </Text>
                    <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />
                  </View>
                  <Text variant="bodySm" color="textSecondary">
                    {t('planner.examOn', { date: examDateLabel(p.examDate, locale) })} ·{' '}
                    {p.studyDays > 0
                      ? t('planner.daysLeft', { n: num(p.studyDays, locale) })
                      : t('planner.examPassed')}
                  </Text>
                  {tasks.length ? (
                    <Text variant="bodySm">
                      {t('planner.todayCount', { done: num(done, locale), total: num(tasks.length, locale) })}
                    </Text>
                  ) : null}
                  {p.access && p.studyDays > 0 && (p.lessonsLeft || p.testsLeft) ? (
                    <StatusChip
                      tone={p.onTrack ? 'done' : 'neutral'}
                      label={p.onTrack ? t('planner.onTrackShort') : t('planner.behindShort')}
                    />
                  ) : null}
                </Card>
              </Pressable>
            );
          })}
          <Button label={t('planner.new')} variant="secondary" onPress={() => router.push('/planner/edit')} />
          <Text variant="caption" color="textMuted">
            {t('planner.intro')}
          </Text>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  list: { gap: 12, paddingBottom: 24 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
