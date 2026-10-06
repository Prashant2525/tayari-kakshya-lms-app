import type { Metadata } from 'next';
import { ForgotForm } from '@/components/auth-forms';
import { Card } from '@/components/ui';
import { getI18n } from '@/lib/i18n';

export const metadata: Metadata = { robots: { index: false } };

export default async function ForgotPasswordPage() {
  const { t } = await getI18n();
  return (
    <Card className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-bold text-text">{t('auth.forgotTitle')}</h1>
      <p className="text-text-secondary">{t('auth.forgotBody')}</p>
      <ForgotForm />
    </Card>
  );
}
