import { radius } from '@tk/design-tokens';
import { Check, CircleDashed, Lock, Star } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Text } from './text';

export type ChipTone = 'done' | 'progress' | 'premium' | 'featured' | 'neutral';

/** Status chip: icon + text, never colour alone (DESIGN_SYSTEM §1). */
export function StatusChip({ tone, label }: { tone: ChipTone; label: string }) {
  const { colors } = useTheme();
  const map = {
    done: { bg: colors.successSoft, fg: colors.success, Icon: Check },
    progress: { bg: colors.primarySoft, fg: colors.onPrimarySoft, Icon: CircleDashed },
    premium: { bg: colors.premium, fg: colors.onPremium, Icon: Lock },
    featured: { bg: colors.premium, fg: colors.onPremium, Icon: Star },
    neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary, Icon: null },
  }[tone];
  return (
    <View style={[styles.chip, { backgroundColor: map.bg }]}>
      {map.Icon ? <map.Icon size={12} color={map.fg} strokeWidth={2.25} /> : null}
      <Text variant="caption" style={{ color: map.fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Thin progress bar announced to screen readers with its value. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <View
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      style={[styles.track, { backgroundColor: colors.surfaceMuted }]}
    >
      <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: colors.primary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    minHeight: 24,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  track: { height: 8, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full },
});
