import type { PlanTaskView } from '@tk/contracts';
import { router } from 'expo-router';
import {
  CircleCheck,
  ClipboardCheck,
  FileText,
  FileType,
  PlayCircle,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { useTheme } from '@/theme/theme';
import { Text } from '@/ui/text';
import { studyDuration } from '@/features/progress/duration';

const ICONS: Record<string, LucideIcon> = { note: FileText, pdf: FileType, video: PlayCircle };

/** One lesson or test of a study plan: opens it; finished ones are ticked. */
export function PlanTaskRow({
  task,
  courseId,
  slug,
}: {
  task: PlanTaskView;
  courseId: string;
  slug: string;
}) {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const Icon = task.done
    ? CircleCheck
    : task.kind === 'test'
      ? ClipboardCheck
      : (ICONS[task.type] ?? FileText);
  const title = localized(task.title, locale);
  const details = [
    task.kind === 'test' ? t('planner.test') : t(`planner.lesson.${task.type as 'note' | 'pdf' | 'video'}`),
    task.subject ? localized(task.subject, locale) : null,
    studyDuration(task.minutes * 60, t, locale),
  ]
    .filter(Boolean)
    .join(' · ');
  const open = () =>
    task.kind === 'test'
      ? router.push({ pathname: '/test/[id]', params: { id: task.id } })
      : router.push({
          pathname: '/learn/[itemId]',
          params: { itemId: task.id, courseId, subjectId: task.subjectId ?? '', slug },
        });
  return (
    <Pressable
      role="link"
      aria-label={`${title}, ${details}${task.done ? `, ${t('planner.done')}` : ''}`}
      onPress={open}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surfaceMuted : 'transparent' },
      ]}
    >
      <View
        style={[styles.icon, { backgroundColor: task.done ? colors.successSoft : colors.primarySoft }]}
        aria-hidden
      >
        <Icon size={18} color={task.done ? colors.success : colors.onPrimarySoft} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          variant="label"
          color={task.done ? 'textSecondary' : 'text'}
          style={task.done ? { textDecorationLine: 'line-through' } : undefined}
        >
          {title}
        </Text>
        <Text variant="caption" color="textMuted">
          {details}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderRadius: 8 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
