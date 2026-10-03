import { radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { BookOpen, FileText, HelpCircle, PlayCircle } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ItemType } from '@/api/learning';
import { useTheme } from '@/theme/theme';
import { StatusChip } from '@/ui/chip';
import { Text } from '@/ui/text';

/** A lesson or question in Saved / Search results: icon, title, subject; opens the lesson or question. */
export function ResultRow({
  kind,
  id,
  title,
  subtitle,
  premiumLabel,
}: {
  kind: ItemType | 'question';
  id: string;
  title: string;
  subtitle: string;
  premiumLabel?: string;
}) {
  const { colors } = useTheme();
  const Icon =
    kind === 'question' ? HelpCircle : kind === 'video' ? PlayCircle : kind === 'pdf' ? FileText : BookOpen;
  return (
    <Pressable
      role="link"
      aria-label={title}
      onPress={() =>
        kind === 'question'
          ? router.push({ pathname: '/question/[id]', params: { id } })
          : router.push({ pathname: '/learn/[itemId]', params: { itemId: id } })
      }
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surfaceMuted : colors.surface, borderColor: colors.border },
      ]}
    >
      <Icon size={20} color={colors.onPrimarySoft} strokeWidth={1.75} />
      <View style={{ flex: 1 }}>
        <Text variant="body" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="caption" color="textMuted">
          {subtitle}
        </Text>
      </View>
      {premiumLabel ? <StatusChip tone="premium" label={premiumLabel} /> : null}
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
});
