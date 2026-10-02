/**
 * Tayari Kakshya design tokens — source of truth for docs/DESIGN_SYSTEM.md.
 * Components must use the *semantic* tokens (`themes.light/dark`), not raw palette values.
 */

export const palette = {
  ink900: '#0F1B3D',
  navy800: '#15234D',
  navy700: '#23335F',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748B',
  slate400: '#94A3B8',
  slate300: '#CBD3DF',
  slate200: '#E2E7EF',
  slate100: '#EEF1F6',
  slate50: '#F6F8FC',
  white: '#FFFFFF',
  blue50: '#EEF4FF',
  blue100: '#DCE7FD',
  blue300: '#8FB1F5',
  blue400: '#6EA2F5',
  blue500: '#3B73E3',
  blue600: '#2563D6',
  blue700: '#1A4FB0',
  amber50: '#FFF7E6',
  amber300: '#FCD34D',
  amber500: '#F59E0B',
  amber700: '#B45309',
  green50: '#ECFDF3',
  green400: '#4ADE80',
  green700: '#15803D',
  red50: '#FEF2F2',
  red400: '#F87171',
  red600: '#DC2626',
  red700: '#B91C1C',
  darkBg: '#0B1220',
  darkSurface: '#111A2E',
  darkRaised: '#18233B',
  darkBorder: '#24314D',
  darkBorderStrong: '#33425F',
  darkText: '#E6EAF2',
  darkTextSecondary: '#B4BFD1',
} as const;

export interface SemanticColors {
  bg: string;
  surface: string;
  surfaceMuted: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  brand: string;
  onBrand: string;
  primary: string;
  primaryHover: string;
  onPrimary: string;
  primarySoft: string;
  onPrimarySoft: string;
  link: string;
  focusRing: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  premium: string;
  onPremium: string;
}

const p = palette;

export const themes: Record<'light' | 'dark', SemanticColors> = {
  light: {
    bg: p.slate50,
    surface: p.white,
    surfaceMuted: p.slate100,
    surfaceRaised: p.white,
    border: p.slate200,
    borderStrong: p.slate300,
    text: p.ink900,
    textSecondary: p.slate600,
    textMuted: p.slate500,
    textInverse: p.white,
    brand: p.navy800,
    onBrand: p.white,
    primary: p.blue600,
    primaryHover: p.blue700,
    onPrimary: p.white,
    primarySoft: p.blue50,
    onPrimarySoft: p.blue700,
    link: p.blue600,
    focusRing: p.blue300,
    success: p.green700,
    successSoft: p.green50,
    warning: p.amber700,
    warningSoft: p.amber50,
    danger: p.red700,
    dangerSoft: p.red50,
    premium: p.amber500,
    onPremium: p.ink900,
  },
  dark: {
    bg: p.darkBg,
    surface: p.darkSurface,
    surfaceMuted: p.darkRaised,
    surfaceRaised: p.darkRaised,
    border: p.darkBorder,
    borderStrong: p.darkBorderStrong,
    text: p.darkText,
    textSecondary: p.darkTextSecondary,
    textMuted: p.slate400,
    textInverse: p.ink900,
    brand: p.navy800,
    onBrand: p.white,
    primary: p.blue600,
    primaryHover: p.blue700,
    onPrimary: p.white,
    primarySoft: '#16264A',
    onPrimarySoft: p.blue400,
    link: p.blue400,
    focusRing: p.blue400,
    success: p.green400,
    successSoft: '#0F2A1C',
    warning: p.amber300,
    warningSoft: '#2B210B',
    danger: p.red400,
    dangerSoft: '#2D1416',
    premium: p.amber500,
    onPremium: p.ink900,
  },
};

/** Mukta covers Devanagari and Latin with shared metrics (DESIGN_SYSTEM §4). */
export const fontFamily = {
  sans: "'Mukta', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
} as const;

export const typography = {
  display: { size: 32, lineHeight: 40, weight: 700 },
  h1: { size: 28, lineHeight: 36, weight: 700 },
  h2: { size: 24, lineHeight: 32, weight: 700 },
  h3: { size: 20, lineHeight: 28, weight: 600 },
  h4: { size: 17, lineHeight: 24, weight: 600 },
  body: { size: 16, lineHeight: 24, weight: 400 },
  bodyReading: { size: 17, lineHeight: 28, weight: 400 },
  bodySm: { size: 14, lineHeight: 20, weight: 400 },
  label: { size: 14, lineHeight: 20, weight: 600 },
  caption: { size: 12, lineHeight: 16, weight: 500 },
} as const;

export const spacing = [0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 } as const;

export const elevation = {
  e1: '0 1px 2px rgba(15,27,61,0.06), 0 1px 3px rgba(15,27,61,0.04)',
  e2: '0 4px 12px rgba(15,27,61,0.08)',
  e3: '0 12px 32px rgba(15,27,61,0.14)',
} as const;

export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  easingStandard: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;
