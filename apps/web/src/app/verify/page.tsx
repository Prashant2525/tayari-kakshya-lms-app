import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui';
import { signedIn } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import { VerifyForm } from '@/components/auth-forms';
import { api } from '@/lib/api';
import type { Me } from '@/lib/types';

export const metadata: Metadata = { robots: { index: false } };

/** Only paths on this site are followed after signing in. */
function safeNext(next: string | undefined) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/account';
}

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = safeNext(next);
  if (!(await signedIn())) redirect(`/login?next=${encodeURIComponent(target)}`);
  const me = await api<Me>('/me');
  if (me.emailVerified || !me.email) redirect(target);
  const { t } = await getI18n();
  return (
    <Card className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-bold text-text">{t('auth.verifyTitle')}</h1>
      <p className="text-text-secondary">{t('auth.verifyBody', { email: me.email })}</p>
      <VerifyForm next={target} />
    </Card>
  );
}
