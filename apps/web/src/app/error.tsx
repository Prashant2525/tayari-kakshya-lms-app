'use client';

import { useT } from '@/components/i18n-provider';
import { button } from '@/components/ui';

/** Shown when a page could not be made — usually because the API could not be reached. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-bold text-text">{t('error.generic')}</h1>
      <p className="mt-2 text-text-secondary">{t('error.network')}</p>
      <button type="button" onClick={reset} className={`${button.primary} mt-6`}>
        {t('payment.tryAgain')}
      </button>
    </div>
  );
}
