import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ResetForm } from '@/components/auth-forms';
import { Card } from '@/components/ui';
import { getI18n } from '@/lib/i18n';

export const metadata: Metadata = { robots: { index: false } };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  if (!email) redirect('/forgot-password');
  const { t } = await getI18n();
  return (
    <Card className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-bold text-text">{t('auth.resetTitle')}</h1>
      <p className="text-text-secondary">{t('auth.resetBody', { email })}</p>
      <ResetForm email={email} />
    </Card>
  );
}
