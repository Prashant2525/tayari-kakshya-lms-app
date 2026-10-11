import { radius } from '@tk/design-tokens';
import { router, useFocusEffect } from 'expo-router';
import { CalendarCheck, ChevronRight } from 'lucide-react-native';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useStudyPlans } from '@/api/planner';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { num } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { Card } from '@/ui/layout';
import { Text } from '@/ui/text';
import { PlanTaskRow } from './task-row';

const SHOWN = 3;

/** Home: today's plan for the student's nearest exam, or a way in to the planner when there is no plan yet. */
export function TodayPlanCard() {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const plans = useStudyPlans();
  // Home stays mounted as a tab: refresh when it is shown again (after a lesson or a test).
  const refetch = plans.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const plan = plans.data?.find((p) => p.access && p.studyDays > 0);

  if (!plans.isSuccess) return null;
  if (!plan) {
    return (
      <Pressable
        role="link"
        aria-label={t('planner.title')}
        onPress={() => router.push('/planner')}
        style={({ pressed }) => [
          styles.link,
          { backgroundColor: pressed ? colors.surfaceMuted : colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
          <CalendarCheck size={22} color={colors.onPrimarySoft} strokeWidth={1.75} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="h4">{t('planner.title')}</Text>
          <Text variant="bodySm" color="textSecondary">
            {t('planner.homeEmpty')}
          </Text>
        </View>
        <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />
      </Pressable>
    );
  }
  const tasks = plan.today?.tasks ?? [];
  const done = tasks.filter((x) => x.done).length;
  const open = () => router.push({ pathname: '/planner/[courseId]', params: { courseId: plan.courseId } });
  return (
    <Card style={{ gap: 6 }}>
      <View style={styles.titleRow}>
        <Text variant="h4" role="heading" style={{ flex: 1 }}>
          {t('planner.homeToday')}
        </Text>
        {tasks.length ? (
          <Text variant="caption" color="textMuted">
            {t('planner.todayCount', { done: num(done, locale), total: num(tasks.length, locale) })}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" color="textMuted">
        {localized(plan.course.title, locale)}
      </Text>
      {tasks.length === 0 ? (
        <Text variant="body" color="textSecondary">
          {plan.lessonsLeft + plan.testsLeft === 0 ? t('planner.allDone') : t('planner.nothingToday')}
        </Text>
      ) : (
        tasks
          .slice(0, SHOWN)
          .map((task) => (
            <PlanTaskRow key={task.id} task={task} courseId={plan.courseId} slug={plan.course.slug} />
          ))
      )}
      <Pressable role="link" onPress={open} hitSlop={8} style={styles.more}>
        <Text variant="label" color="link">
          {t('planner.open')}
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  more: { minHeight: 44, justifyContent: 'center' },
});
