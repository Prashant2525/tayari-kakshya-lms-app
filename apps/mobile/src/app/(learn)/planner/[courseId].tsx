import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useStudyPlan } from '@/api/planner';
import { examDateLabel, planDayLabel } from '@/features/planner/days';
import { PlanTaskRow } from '@/features/planner/task-row';
import { studyDuration } from '@/features/progress/duration';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { num } from '@/lib/format';
import { Button } from '@/ui/button';
import { BackButton, Banner, Card, Screen, Skeleton } from '@/ui/layout';
import { ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

const FIRST_DAYS = 7;

/** One study plan (S7, D-066): today's lessons and tests, then the coming days; re-planned from today on each visit. */
export default function PlanScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const { t, locale } = useT();
  const plan = useStudyPlan(courseId);
  const [allDays, setAllDays] = useState(false);
  // Back from a lesson or test: the plan changes with what was finished.
  const refetch = plan.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const p = plan.data;
  const time = (minutes: number) => studyDuration(minutes * 60, t, locale);

  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading" style={{ flex: 1 }} numberOfLines={2}>
          {p ? localized(p.course.title, locale) : t('planner.title')}
        </Text>
      </View>
      {plan.isPending ? (
        <Skeleton height={200} />
      ) : plan.isError ? (
        <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />
      ) : p ? (
        <ScrollView contentContainerStyle={styles.list}>
          <View style={{ gap: 2 }}>
            <Text variant="bodySm" color="textSecondary">
              {t('planner.examOn', { date: examDateLabel(p.examDate, locale) })} ·{' '}
              {p.studyDays > 0
                ? t('planner.daysLeft', { n: num(p.studyDays, locale) })
                : t('planner.examPassed')}
            </Text>
            <Text variant="bodySm" color="textSecondary">
              {t('planner.minutesPerDay')}: {time(p.minutesPerDay)}
            </Text>
          </View>

          {!p.access ? (
            <Banner tone="warning" message={t('planner.noAccess')} />
          ) : p.lessonsLeft + p.testsLeft === 0 ? (
            <Banner tone="success" message={t('planner.allDone')} />
          ) : p.studyDays > 0 ? (
            p.onTrack ? (
              <Banner
                tone="success"
                message={t('planner.onTrack', {
                  lessons: num(p.lessonsLeft, locale),
                  tests: num(p.testsLeft, locale),
                  time: time(p.minutesLeft),
                })}
              />
            ) : (
              <Banner
                tone="warning"
                message={t('planner.behind', { needed: time(p.neededMinutesPerDay ?? p.minutesLeft) })}
              />
            )
          ) : null}

          {p.days.slice(0, allDays ? undefined : FIRST_DAYS).map((d, i) => {
            const done = d.tasks.filter((x) => x.done).length;
            return (
              <Card key={d.day} style={{ gap: 4 }}>
                <View style={styles.rowBetween}>
                  <Text variant="h4" role="heading" style={{ flex: 1 }}>
                    {i === 0 ? t('planner.today') : planDayLabel(d.day, locale)}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {time(d.minutes)}
                  </Text>
                </View>
                {i === 0 && d.tasks.length ? (
                  <Text variant="caption" color="textMuted">
                    {t('planner.todayCount', { done: num(done, locale), total: num(d.tasks.length, locale) })}
                  </Text>
                ) : null}
                {d.tasks.length === 0 ? (
                  <Text variant="body" color="textSecondary">
                    {t('planner.nothingToday')}
                  </Text>
                ) : (
                  d.tasks.map((task) => (
                    <PlanTaskRow key={task.id} task={task} courseId={p.courseId} slug={p.course.slug} />
                  ))
                )}
              </Card>
            );
          })}
          {!allDays && p.days.length > FIRST_DAYS ? (
            <Button
              label={t('planner.showMore')}
              variant="secondary"
              size="md"
              onPress={() => setAllDays(true)}
            />
          ) : null}

          {p.unscheduled.length ? (
            <Card style={{ gap: 4 }}>
              <Text variant="h4" role="heading">
                {t('planner.unscheduled', { n: num(p.unscheduled.length, locale) })}
              </Text>
              {p.unscheduled.slice(0, 20).map((task) => (
                <PlanTaskRow key={task.id} task={task} courseId={p.courseId} slug={p.course.slug} />
              ))}
            </Card>
          ) : null}

          <Button
            label={t('planner.edit')}
            variant="secondary"
            onPress={() => router.push({ pathname: '/planner/edit', params: { courseId: p.courseId } })}
          />
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  list: { gap: 12, paddingBottom: 24 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
