import { radius } from '@tk/design-tokens';
import { Eye, EyeOff } from 'lucide-react-native';
import { forwardRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { useT } from '@/i18n/use-t';
import { fontFamilies, useTheme } from '@/theme/theme';
import { Text } from './text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | undefined;
  hint?: string;
  /** Adds a show/hide toggle and hides the value. */
  password?: boolean;
}

/** Labelled input with hint and inline error (DESIGN_SYSTEM §7). */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, password = false, ...input },
  ref,
) {
  const { colors } = useTheme();
  const { t } = useT();
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text variant="label">{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          ref={ref}
          aria-label={label}
          aria-invalid={Boolean(error)}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={password && hidden}
          autoCapitalize={password ? 'none' : input.autoCapitalize}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[
            styles.input,
            noFocusRing,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: error ? colors.danger : focused ? colors.primary : colors.borderStrong,
              borderWidth: focused || error ? 2 : 1,
              paddingRight: password ? 52 : 14,
            },
          ]}
        />
        {password ? (
          <Pressable
            role="button"
            aria-label={hidden ? t('auth.showPassword') : t('auth.hidePassword')}
            onPress={() => setHidden((h) => !h)}
            style={styles.eye}
            hitSlop={4}
          >
            {hidden ? (
              <Eye size={20} color={colors.textSecondary} strokeWidth={1.75} />
            ) : (
              <EyeOff size={20} color={colors.textSecondary} strokeWidth={1.75} />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="bodySm" color="danger" role="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="bodySm" color="textSecondary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

/**
 * Inputs show focus with their own primary border. On the web build the browser would also draw its focus ring
 * (`outline-style: auto`, which ignores `outlineWidth`), so it is turned off there. React Native's types only list
 * solid/dotted/dashed, hence the cast.
 */
export const noFocusRing = Platform.select<TextStyle>({
  web: { outlineStyle: 'none' } as unknown as TextStyle,
  default: {},
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  inputRow: { position: 'relative', justifyContent: 'center' },
  input: {
    minHeight: 50,
    borderRadius: radius.sm + 2,
    paddingHorizontal: 14,
    fontFamily: fontFamilies[400],
    fontSize: 16,
  },
  eye: {
    position: 'absolute',
    right: 4,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
