import { radius } from '@tk/design-tokens';
import { toDevanagariDigits } from '@tk/domain';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useT } from '@/i18n/use-t';
import { fontFamilies, useTheme } from '@/theme/theme';
import { Text } from './text';

export interface OtpInputProps {
  value: string;
  onChange: (code: string) => void;
  error?: string | undefined;
  /** Called when all six digits are entered. */
  onComplete?: (code: string) => void;
}

const LENGTH = 6;

/**
 * Six boxes backed by one real input, so paste and the phone's SMS code suggestion work.
 * Devanagari digits typed on a Nepali keyboard are accepted and converted.
 */
export function OtpInput({ value, onChange, error, onComplete }: OtpInputProps) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const handle = (text: string) => {
    const digits = text
      .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
      .replace(/\D/g, '')
      .slice(0, LENGTH);
    onChange(digits);
    if (digits.length === LENGTH) onComplete?.(digits);
  };

  return (
    <View style={{ gap: 8 }}>
      <Pressable onPress={() => input.current?.focus()} style={styles.row} accessible={false}>
        {Array.from({ length: LENGTH }, (_, i) => {
          const char = value[i] ?? '';
          const active = focused && i === Math.min(value.length, LENGTH - 1);
          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  backgroundColor: colors.surface,
                  borderColor: error ? colors.danger : active ? colors.primary : colors.borderStrong,
                  borderWidth: active || error ? 2 : 1.5,
                },
              ]}
            >
              <Text variant="h3" weight={600}>
                {locale === 'ne' ? toDevanagariDigits(char) : char}
              </Text>
            </View>
          );
        })}
        <TextInput
          ref={input}
          value={value}
          onChangeText={handle}
          aria-label={t('verify.code')}
          aria-invalid={Boolean(error)}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={LENGTH * 2}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          caretHidden
          style={styles.hiddenInput}
        />
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
  row: { flexDirection: 'row', gap: 8, position: 'relative' },
  box: {
    flex: 1,
    height: 56,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Covers the boxes so a tap anywhere focuses it; transparent so only the boxes are visible.
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.011,
    color: 'transparent',
    fontFamily: fontFamilies[400],
  },
});
