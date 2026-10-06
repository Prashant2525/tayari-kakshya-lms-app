import Link from 'next/link';
import { button } from '@/components/ui';
import { getI18n } from '@/lib/i18n';

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-3xl font-bold text-text">{t('error.notFound')}</h1>
      <p className="mt-2 text-text-secondary">{t('error.notFoundBody')}</p>
      <Link href="/" className={`${button.primary} mt-6`}>
        {t('error.home')}
      </Link>
    </div>
  );
}
