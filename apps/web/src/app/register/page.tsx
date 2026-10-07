import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui';
import { api, signedIn } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import { PAGE_PATH, publishedPages } from '@/lib/pages';
import { RegisterForm } from '@/components/auth-forms';

export const metadata: Metadata = { robots: { index: false } };

/** Only paths on this site are followed after signing in. */
function safeNext(next: string | undefined) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/account';
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; ref?: string }>;
}) {
  const { next, ref } = await searchParams;
  const target = safeNext(next);
  if (await signedIn()) redirect(target);
  const { t, localized } = await getI18n();
  const legal = (await publishedPages())
    .filter((p) => p.slug === 'terms' || p.slug === 'privacy')
    .map((p) => ({ href: PAGE_PATH[p.slug], label: localized(p.title) }));
  const referral = ref && /^[A-Za-z0-9]{6,12}$/.test(ref) ? ref.toUpperCase() : '';
  const config = await api<{ referrals?: { enabled: boolean } }>('/app/config', {
    auth: false,
    revalidate: 60,
  }).catch(() => null);
  const referralsOn = config?.referrals?.enabled === true;
  return (
    <Card className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-bold text-text">{t('auth.registerTitle')}</h1>
      <RegisterForm
        next={target}
        referralCode={referral}
        showReferral={Boolean(referral) || referralsOn}
        legal={legal}
      />
    </Card>
  );
}
