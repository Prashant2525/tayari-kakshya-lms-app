import { radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { ChevronRight, ClipboardCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { useSurfaceStyle } from '@/ui/layout';
import { PressableScale } from '@/ui/motion';
import { Text } from '@/ui/text';

/** Entry to a list of tests (Home: my exams; course page: this course). */
export function TestsLink({ title, body, courseId }: { title: string; body?: string; courseId?: string }) {
  const { colors } = useTheme();
  const surface = useSurfaceStyle();
  return (
    <PressableScale
      role="link"
      aria-label={title}
      onPress={() => router.push(courseId ? { pathname: '/tests', params: { courseId } } : '/tests')}
      style={[styles.row, surface]}
    >
      <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
        <ClipboardCheck size={22} color={colors.onPrimarySoft} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="h4">{title}</Text>
        {body ? (
          <Text variant="bodySm" color="textSecondary">
            {body}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
