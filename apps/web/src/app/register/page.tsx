import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui';
import { signedIn } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import { RegisterForm } from '@/components/auth-forms';

export const metadata: Metadata = { robots: { index: false } };

/** Only paths on this site are followed after signing in. */
function safeNext(next: string | undefined) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/account';
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = safeNext(next);
  if (await signedIn()) redirect(target);
  const { t } = await getI18n();
  return (
    <Card className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-bold text-text">{t('auth.registerTitle')}</h1>
      <RegisterForm next={target} />
    </Card>
  );
}
