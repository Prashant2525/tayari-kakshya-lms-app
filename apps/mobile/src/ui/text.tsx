import { typography, type SemanticColors } from '@tk/design-tokens';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { fontFamilies, useTheme, type FontWeight } from '@/theme/theme';

export type TextVariant = keyof typeof typography;

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: keyof SemanticColors;
  weight?: FontWeight;
  align?: 'left' | 'center' | 'right';
}

/** Typography from the design tokens (DESIGN_SYSTEM §4); sizes scale with the phone's font setting. */
export function Text({ variant = 'body', color = 'text', weight, align, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const t = typography[variant];
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: fontFamilies[weight ?? (t.weight as FontWeight)],
          fontSize: t.size,
          lineHeight: t.lineHeight,
          color: colors[color],
          textAlign: align,
        },
        style,
      ]}
    />
  );
}
