import { radius } from '@tk/design-tokens';
import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Text } from './text';

export function Checkbox({
  label,
  checked,
  onChange,
  error,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | undefined;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        onPress={() => onChange(!checked)}
        style={styles.row}
      >
        <View
          style={[
            styles.box,
            {
              borderColor: error ? colors.danger : checked ? colors.primary : colors.borderStrong,
              backgroundColor: checked ? colors.primary : colors.surface,
            },
          ]}
        >
          {checked ? <Check size={16} color={colors.onPrimary} strokeWidth={2.5} /> : null}
        </View>
        <Text variant="bodySm" style={{ flex: 1 }}>
          {label}
        </Text>
      </Pressable>
      {error ? (
        <Text variant="bodySm" color="danger" role="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.sm - 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
