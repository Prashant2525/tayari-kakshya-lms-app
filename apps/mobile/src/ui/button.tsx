import { radius } from '@tk/design-tokens';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Text } from './text';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled = false,
  icon,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { colors } = useTheme();
  const palette = {
    primary: {
      bg: colors.primary,
      pressed: colors.primaryHover,
      fg: colors.onPrimary,
      border: 'transparent',
    },
    secondary: {
      bg: colors.surface,
      pressed: colors.surfaceMuted,
      fg: colors.text,
      border: colors.borderStrong,
    },
    tertiary: { bg: 'transparent', pressed: colors.surfaceMuted, fg: colors.link, border: 'transparent' },
    destructive: { bg: colors.danger, pressed: colors.danger, fg: colors.textInverse, border: 'transparent' },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      role="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      aria-disabled={inactive}
      accessibilityHint={accessibilityHint}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: size === 'lg' ? 52 : 44,
          backgroundColor: pressed ? palette.pressed : palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={palette.fg} /> : icon}
        <Text variant="label" weight={600} style={{ color: palette.fg, fontSize: size === 'lg' ? 16 : 15 }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
