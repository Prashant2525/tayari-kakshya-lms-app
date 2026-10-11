import { radius } from '@tk/design-tokens';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/theme';
import { PressableScale } from './motion';
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
  const { colors, scheme } = useTheme();
  const [pressed, setPressed] = useState(false);
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
  // The main action stands slightly off the page (light theme; shadows do not read on dark surfaces).
  const lifted = variant === 'primary' && scheme === 'light' && !inactive;
  return (
    <PressableScale
      role="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      aria-disabled={inactive}
      accessibilityHint={accessibilityHint}
      disabled={inactive}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      testID={testID}
      style={[
        styles.base,
        {
          minHeight: size === 'lg' ? 52 : 44,
          backgroundColor: pressed ? palette.pressed : palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.5 : 1,
        },
        lifted && styles.lifted,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={palette.fg} /> : icon}
        <Text variant="label" weight={600} style={{ color: palette.fg, fontSize: size === 'lg' ? 16 : 15 }}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lifted: { boxShadow: '0 6px 16px rgba(37,99,214,0.28)' },
});
