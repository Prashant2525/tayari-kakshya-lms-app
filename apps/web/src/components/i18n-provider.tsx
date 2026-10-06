'use client';

import { formatNpr } from '@tk/domain';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { translator, type Locale } from '@/lib/messages';

const LocaleContext = createContext<Locale>('en');

/** The reader's language for client components (server components use getI18n). */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useT() {
  const locale = useContext(LocaleContext);
  return useMemo(
    () => ({ locale, t: translator(locale), npr: (paisa: number) => formatNpr(paisa, locale) }),
    [locale],
  );
}
