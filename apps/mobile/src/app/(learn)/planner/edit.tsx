import { BS_MAX_YEAR, BS_MONTH_NAMES, daysInBsMonth, instantToBs, toDevanagariDigits } from '@tk/domain';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useMyCourseList } from '@/api/learning';
import { useDeletePlan, useSavePlan, useStudyPlan, useStudyPlans } from '@/api/planner';
import { studyDuration } from '@/features/progress/duration';
import type { MessageKey } from '@/i18n/en';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { adIsoToBs, bsToAdIso, nepalToday } from '@/lib/dates';
import { errorMessageKey } from '@/lib/error-message';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { BackButton, Banner, Screen, Skeleton } from '@/ui/layout';
import { SelectField } from '@/ui/select';
import { Text } from '@/ui/text';

const MINUTES = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300] as const;

/** Make or change a study plan: course, exam date (BS) and study time a day (S7, D-066). */
export default function PlanFormScreen() {
  const params = useLocalSearchParams<{ courseId?: string }>();
  const editing = params.courseId || '';
  const existing = useStudyPlan(editing);
  const { t } = useT();
  if (editing && existing.isPending) {
    return (
      <Screen edges={['top']} contentStyle={styles.content}>
        <Skeleton height={240} />
      </Screen>
    );
  }
  const plan = existing.data;
  return (
    <PlanForm
      key={plan?.courseId ?? 'new'}
      courseId={plan?.courseId ?? null}
      examDate={plan?.examDate ?? null}
      minutesPerDay={plan?.minutesPerDay ?? 60}
      title={editing ? t('planner.edit') : t('planner.new')}
    />
  );
}

function PlanForm(props: {
  courseId: string | null;
  examDate: string | null;
  minutesPerDay: number;
  title: string;
}) {
  const { t, locale } = useT();
  const courses = useMyCourseList();
  const plans = useStudyPlans();
  const initial = props.examDate ? adIsoToBs(props.examDate) : null;
  const [courseId, setCourseId] = useState<string | null>(props.courseId);
  const [year, setYear] = useState<number | null>(initial?.year ?? null);
  const [month, setMonth] = useState<number | null>(initial?.month ?? null);
  const [day, setDay] = useState<number | null>(initial?.day ?? null);
  const [minutes, setMinutes] = useState<number>(props.minutesPerDay);
  const [problem, setProblem] = useState<MessageKey | null>(null);
  const [confirm, setConfirm] = useState(false);
  const save = useSavePlan(courseId ?? '');
  const remove = useDeletePlan(props.courseId ?? '');

  const digits = (n: number) => (locale === 'ne' ? toDevanagariDigits(n) : String(n));
  const thisYear = instantToBs(new Date()).year;
  const years = [0, 1, 2, 3]
    .map((i) => thisYear + i)
    .filter((y) => y <= BS_MAX_YEAR)
    .map((y) => ({ value: y, label: digits(y) }));
  const months = BS_MONTH_NAMES[locale].map((name, i) => ({ value: i + 1, label: name }));
  const dayCount = year && month ? daysInBsMonth(year, month) : 32;
  const days = Array.from({ length: dayCount }, (_, i) => ({ value: i + 1, label: digits(i + 1) }));
  // A course already planned is changed from its own plan, so a new plan offers the others.
  const planned = new Set((plans.data ?? []).map((p) => p.courseId));
  const courseOptions = (courses.data ?? [])
    .filter((c) => c.id === props.courseId || !planned.has(c.id))
    .map((c) => ({ value: c.id, label: localized(c.title, locale) }));

  const submit = () => {
    if (!courseId) return setProblem('planner.courseError');
    if (year === null || month === null || day === null) return setProblem('planner.dateError');
    const examDate = bsToAdIso({ year, month, day: Math.min(day, dayCount) });
    if (examDate <= nepalToday()) return setProblem('planner.dateError');
    setProblem(null);
    save.mutate(
      { examDate, minutesPerDay: minutes },
      {
        onSuccess: () => router.replace({ pathname: '/planner/[courseId]', params: { courseId } }),
        onError: (e) => setProblem(errorMessageKey(e)),
      },
    );
  };

  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {props.title}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {props.courseId ? null : courses.isSuccess && courseOptions.length === 0 ? (
          <Banner tone="info" message={t('planner.noCourses')} />
        ) : (
          <SelectField
            label={t('planner.course')}
            value={courseId}
            options={courseOptions}
            placeholder={t('planner.chooseCourse')}
            onChange={setCourseId}
          />
        )}
        <View style={{ gap: 6 }}>
          <Text variant="label">{t('planner.examDate')}</Text>
          <View style={styles.row}>
            <SelectField
              compact
              label={t('profile.year')}
              value={year}
              options={years}
              placeholder="—"
              onChange={setYear}
            />
            <SelectField
              compact
              label={t('profile.month')}
              value={month}
              options={months}
              placeholder="—"
              onChange={setMonth}
            />
            <SelectField
              compact
              label={t('profile.day')}
              value={day}
              options={days}
              placeholder="—"
              onChange={setDay}
            />
          </View>
        </View>
        <SelectField
          label={t('planner.minutesPerDay')}
          value={minutes}
          options={MINUTES.map((m) => ({ value: m, label: studyDuration(m * 60, t, locale) }))}
          placeholder="—"
          onChange={setMinutes}
        />
        {problem ? <Banner message={t(problem)} /> : null}
        <Button label={t('planner.save')} loading={save.isPending} onPress={submit} />
        {props.courseId ? (
          <Button label={t('planner.delete')} variant="secondary" onPress={() => setConfirm(true)} />
        ) : null}
        <Text variant="caption" color="textMuted">
          {t('planner.intro')}
        </Text>
      </ScrollView>
      <Dialog visible={confirm} title={t('planner.delete')} onClose={() => setConfirm(false)}>
        <Text variant="body">{t('planner.deleteConfirm')}</Text>
        <Button
          label={t('planner.delete')}
          variant="destructive"
          loading={remove.isPending}
          onPress={() =>
            remove.mutate(undefined, {
              onSuccess: () => {
                setConfirm(false);
                router.dismissTo('/planner');
              },
            })
          }
        />
      </Dialog>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  form: { gap: 16, paddingBottom: 24 },
  row: { flexDirection: 'row', gap: 8 },
});
