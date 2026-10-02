import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.js';
import { buildCss } from './css.js';
import { themes, type SemanticColors } from './tokens.js';

type Pair = [foreground: keyof SemanticColors, background: keyof SemanticColors, minimum: number];

// WCAG 2.2 AA: 4.5:1 for text, 3:1 for large text / UI components and focus indicators.
const PAIRS: Pair[] = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'surfaceMuted', 4.5],
  ['textSecondary', 'surface', 4.5],
  ['textSecondary', 'bg', 4.5],
  ['textMuted', 'surface', 4.5],
  ['onPrimary', 'primary', 4.5],
  ['onPrimary', 'primaryHover', 4.5],
  ['onPrimarySoft', 'primarySoft', 4.5],
  ['link', 'surface', 4.5],
  ['onBrand', 'brand', 4.5],
  ['success', 'surface', 4.5],
  ['success', 'successSoft', 4.5],
  ['warning', 'surface', 4.5],
  ['warning', 'warningSoft', 4.5],
  ['danger', 'surface', 4.5],
  ['danger', 'dangerSoft', 4.5],
  ['onPremium', 'premium', 4.5],
  ['borderStrong', 'surface', 1.3],
];

describe.each(['light', 'dark'] as const)('%s theme contrast', (theme) => {
  it.each(PAIRS)('%s on %s ≥ %s:1', (fg, bg, min) => {
    expect(contrastRatio(themes[theme][fg], themes[theme][bg])).toBeGreaterThanOrEqual(min);
  });
});

describe('CSS output', () => {
  it('emits every semantic token for both themes', () => {
    const css = buildCss();
    expect(css).toContain('--tk-primary: #2563D6;');
    expect(css).toContain("[data-theme='dark']");
    expect(css.match(/--tk-on-primary-soft:/g)).toHaveLength(3);
  });
});
