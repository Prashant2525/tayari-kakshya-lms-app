import type { DiscussionTarget } from '@tk/contracts';
import { router } from 'expo-router';
import { MessagesSquare } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';
import { useT } from '@/i18n/use-t';
import { useTheme } from '@/theme/theme';
import { Text } from '@/ui/text';

/** Opens the discussion under a question (once its answer is shown) or a lesson (S12, D-066). */
export function DiscussLink({
  target,
  id,
  title,
  compact = false,
}: {
  target: DiscussionTarget;
  id: string;
  title?: string;
  /** Icon only (screen headers). */
  compact?: boolean;
}) {
  const { t } = useT();
  const { colors } = useTheme();
  return (
    <Pressable
      role="link"
      aria-label={t('discuss.open')}
      onPress={() =>
        router.push({ pathname: '/discuss/[target]/[id]', params: { target, id, title: title ?? '' } })
      }
      hitSlop={8}
      style={compact ? styles.icon : styles.link}
    >
      <MessagesSquare
        size={compact ? 22 : 18}
        color={compact ? colors.text : colors.link}
        strokeWidth={1.75}
      />
      {compact ? null : (
        <Text variant="label" color="link">
          {t('discuss.open')}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
