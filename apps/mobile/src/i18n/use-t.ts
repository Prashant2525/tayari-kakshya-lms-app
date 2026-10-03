import { useCallback } from 'react';
import { usePrefs } from '@/state/prefs';
import type { MessageKey } from './en';
import { translate, type Locale, type TranslateVars } from './translate';

/** Current interface language and a translator bound to it. */
export function useT(): { t: (key: MessageKey, vars?: TranslateVars) => string; locale: Locale } {
  const locale = usePrefs((s) => s.locale);
  const t = useCallback((key: MessageKey, vars?: TranslateVars) => translate(locale, key, vars), [locale]);
  return { t, locale };
}
