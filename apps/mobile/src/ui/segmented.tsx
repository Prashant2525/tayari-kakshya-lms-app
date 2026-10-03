import { radius } from '@tk/design-tokens';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Text } from './text';

export interface SegmentedProps<V extends string> {
  label: string;
  value: V;
  options: ReadonlyArray<{ value: V; label: string }>;
  onChange: (value: V) => void;
}

/** One segmented control style everywhere (DESIGN_SYSTEM §2). Announced as a radio group. */
export function Segmented<V extends string>({ label, value, options, onChange }: SegmentedProps<V>) {
  const { colors } = useTheme();
  return (
    <View
      role="radiogroup"
      aria-label={label}
      style={[styles.group, { backgroundColor: colors.surfaceMuted }]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            role="radio"
            aria-checked={selected}
            aria-label={o.label}
            onPress={() => onChange(o.value)}
            style={[
              styles.option,
              selected && { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text variant="label" color={selected ? 'text' : 'textSecondary'} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', borderRadius: radius.md, padding: 3, gap: 3 },
  option: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: radius.sm + 1,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
