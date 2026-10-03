import { themes, type SemanticColors } from '@tk/design-tokens';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { usePrefs } from '@/state/prefs';

/** Mukta covers Devanagari and Latin with shared metrics (DESIGN_SYSTEM §4). One family name per weight. */
export const fontFamilies = {
  400: 'Mukta_400Regular',
  500: 'Mukta_500Medium',
  600: 'Mukta_600SemiBold',
  700: 'Mukta_700Bold',
} as const;
export type FontWeight = keyof typeof fontFamilies;

export interface Theme {
  scheme: 'light' | 'dark';
  colors: SemanticColors;
}

const ThemeContext = createContext<Theme>({ scheme: 'light', colors: themes.light });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const pref = usePrefs((s) => s.theme);
  const scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  const value = useMemo(() => ({ scheme, colors: themes[scheme] }), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
