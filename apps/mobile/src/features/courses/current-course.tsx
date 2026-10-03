import { radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { ChevronsUpDown, PlayCircle } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useContinue, useMyCourseList, type MyCourse } from '@/api/learning';
import { useMe } from '@/api/queries';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { percent } from '@/lib/format';
import { usePrefs } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { ProgressBar } from '@/ui/chip';
import { Card, Skeleton } from '@/ui/layout';
import { Text } from '@/ui/text';

/**
 * Home's current course (D-011): progress, Continue (the last unfinished lesson) and a switcher when the
 * student has several courses. The choice is remembered on this device. Renders nothing without courses.
 */
export function CurrentCourse() {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const me = useMe();
  const courses = useMyCourseList();
  const next = useContinue();
  const chosen = usePrefs((s) => (me.data ? s.currentCourse[me.data.id] : undefined));
  const [picking, setPicking] = useState(false);

  if (courses.isPending) return <Skeleton height={168} />;
  const list = courses.data ?? [];
  if (list.length === 0) return null;
  const course = list.find((c) => c.id === chosen) ?? list[0]!;
  const title = localized(course.title, locale);
  const pct = percent(course.progress.completed, course.progress.total);
  const resume = next.data && (next.data.course?.id ?? course.id) === course.id ? next.data : null;

  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" color="textMuted" style={styles.overline}>
            {t('home.currentCourse')}
          </Text>
          <Text variant="h3" numberOfLines={2}>
            {title}
          </Text>
        </View>
        {list.length > 1 ? (
          <Pressable
            role="button"
            aria-label={t('home.chooseCourse')}
            onPress={() => setPicking(true)}
            style={[styles.switch, { borderColor: colors.border }]}
          >
            <Text variant="label" color="link">
              {t('home.switch')}
            </Text>
            <ChevronsUpDown size={14} color={colors.link} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>
      <View style={{ gap: 6 }}>
        <ProgressBar value={pct} label={t('home.percent', { percent: pct })} />
        <Text variant="bodySm" color="textSecondary">
          {t('home.percent', { percent: pct })}
        </Text>
      </View>
      {resume ? (
        <Button
          icon={<PlayCircle size={18} color={colors.onPrimary} strokeWidth={1.75} />}
          label={t('home.continue', { title: localized(resume.item.title, locale) })}
          onPress={() =>
            router.push({
              pathname: '/learn/[itemId]',
              params: {
                itemId: resume.item.id,
                courseId: course.id,
                subjectId: resume.subject.id,
                slug: course.slug,
              },
            })
          }
        />
      ) : (
        <Button
          label={t('home.start')}
          onPress={() => router.push({ pathname: '/course/[slug]', params: { slug: course.slug } })}
        />
      )}
      <CoursePicker
        visible={picking}
        courses={list}
        current={course.id}
        onClose={() => setPicking(false)}
        onPick={(id) => {
          if (me.data) usePrefs.getState().setCurrentCourse(me.data.id, id);
          setPicking(false);
        }}
      />
    </Card>
  );
}

function CoursePicker({
  visible,
  courses,
  current,
  onClose,
  onPick,
}: {
  visible: boolean;
  courses: MyCourse[];
  current: string;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} aria-label={t('common.close')} />
      <View
        style={[styles.sheet, { backgroundColor: colors.surfaceRaised }]}
        role="dialog"
        aria-label={t('home.chooseCourse')}
      >
        <Text variant="h4" role="heading">
          {t('home.chooseCourse')}
        </Text>
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
          <View role="radiogroup" style={{ gap: 8 }}>
            {courses.map((c) => {
              const selected = c.id === current;
              return (
                <Pressable
                  key={c.id}
                  role="radio"
                  aria-checked={selected}
                  aria-label={localized(c.title, locale)}
                  onPress={() => onPick(c.id)}
                  style={[
                    styles.option,
                    { borderColor: selected ? colors.primary : colors.border, borderWidth: selected ? 2 : 1 },
                  ]}
                >
                  <Text variant="body" style={{ flex: 1 }}>
                    {localized(c.title, locale)}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {t('home.percent', { percent: percent(c.progress.completed, c.progress.total) })}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <Button label={t('common.close')} variant="tertiary" size="md" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  overline: { textTransform: 'uppercase', letterSpacing: 0.4 },
  switch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,27,61,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxWidth: 640,
    alignSelf: 'center',
    width: '100%',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    minHeight: 52,
  },
});
