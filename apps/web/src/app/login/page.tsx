import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui';
import { signedIn } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import { Alert } from '@/components/ui';
import { SignInForm } from '@/components/auth-forms';

export const metadata: Metadata = { robots: { index: false } };

/** Only paths on this site are followed after signing in. */
function safeNext(next: string | undefined) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/account';
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const { next, reset } = await searchParams;
  const target = safeNext(next);
  if (await signedIn()) redirect(target);
  const { t } = await getI18n();
  return (
    <Card className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-bold text-text">{t('auth.signInTitle')}</h1>
      <p className="text-text-secondary">{t('auth.signInBody')}</p>
      {reset ? <Alert tone="success">{t('auth.resetDone')}</Alert> : null}
      <SignInForm next={target} />
    </Card>
  );
}
