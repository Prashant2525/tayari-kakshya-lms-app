'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { setLocaleAction } from '@/app/actions/auth';
import { useT } from './i18n-provider';

/** English ⇄ Nepali for the whole site (D-008); remembered in a cookie. */
export function LanguageToggle() {
  const { locale, t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      lang={locale === 'en' ? 'ne' : 'en'}
      aria-label={t('lang.switchLabel')}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setLocaleAction(locale === 'en' ? 'ne' : 'en');
          router.refresh();
        })
      }
      className="min-h-11 rounded-md px-3 text-sm font-semibold text-text-secondary hover:bg-surface-muted"
    >
      {t('lang.switch')}
    </button>
  );
}
