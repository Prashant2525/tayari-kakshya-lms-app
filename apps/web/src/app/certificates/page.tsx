import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { button, Card, Field, input, PageTitle } from '@/components/ui';
import { getI18n } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('cert.title') };
}

async function lookup(form: FormData) {
  'use server';
  const code = String(form.get('code') ?? '').replace(/[^0-9A-Za-z]/g, '');
  redirect(code ? `/certificates/${encodeURIComponent(code)}` : '/certificates');
}

/** Anyone can check a certificate number (printed on every certificate with a QR code, D-049). */
export default async function CertificateLookupPage() {
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-md">
      <PageTitle>{t('cert.title')}</PageTitle>
      <Card>
        <form action={lookup} className="flex flex-col gap-4">
          <Field label={t('cert.lookup')}>
            <input
              name="code"
              required
              autoCapitalize="characters"
              className={`${input} font-mono uppercase`}
            />
          </Field>
          <button className={button.primary}>{t('cert.check')}</button>
        </form>
      </Card>
    </div>
  );
}
