import { radius } from '@tk/design-tokens';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Text } from './text';

/** A row of single-choice filter pills that scrolls sideways. */
export function FilterPills<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V | null;
  options: Array<{ value: V | null; label: string }>;
  onChange: (value: V | null) => void;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <View role="radiogroup" aria-label={label} style={styles.row}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value ?? 'all'}
              role="radio"
              aria-checked={selected}
              onPress={() => onChange(o.value)}
              style={[
                styles.pill,
                {
                  backgroundColor: selected ? colors.primarySoft : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text variant="bodySm" color={selected ? 'onPrimarySoft' : 'text'}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  pill: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
});
