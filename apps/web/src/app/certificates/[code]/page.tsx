import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, button, Card, PageTitle } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { serverEnv } from '@/lib/env';
import { getI18n } from '@/lib/i18n';
import type { CertificateCheck } from '@/lib/types';

export const metadata: Metadata = { robots: { index: false } };

/** The page a certificate's QR code opens (CMS setting certificates.verification = <site>/certificates). */
export default async function CertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { t, localized, bsDate } = await getI18n();
  const cert = await api<CertificateCheck>(`/certificates/${encodeURIComponent(code)}`, {
    auth: false,
  }).catch((err: unknown) => {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) return null;
    throw err;
  });
  return (
    <div className="mx-auto max-w-lg">
      <PageTitle>{t('cert.title')}</PageTitle>
      {!cert ? (
        <Alert>{t('cert.notFound')}</Alert>
      ) : (
        <Card className="flex flex-col gap-4">
          {cert.status === 'valid' ? (
            <Alert tone="success">{t('cert.valid')}</Alert>
          ) : (
            <Alert>{t('cert.revoked')}</Alert>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
            <dt className="text-text-secondary">{t('cert.holder')}</dt>
            <dd className="font-semibold text-text">{cert.holderName}</dd>
            <dt className="text-text-secondary">{t('cert.course')}</dt>
            <dd className="text-text">{localized(cert.courseTitle)}</dd>
            <dt className="text-text-secondary">{t('cert.issued')}</dt>
            <dd className="text-text">{bsDate(cert.issuedAt)}</dd>
            <dt className="text-text-secondary">{t('cert.number')}</dt>
            <dd className="font-mono text-text">{cert.code}</dd>
          </dl>
          {cert.status === 'valid' ? (
            <a
              href={`${serverEnv.apiPublicUrl}/certificates/${encodeURIComponent(code)}/pdf`}
              className={button.secondary}
              target="_blank"
              rel="noopener"
            >
              {t('cert.pdf')}
            </a>
          ) : null}
        </Card>
      )}
      <Link href="/certificates" className={`${button.link} mt-4 inline-block`}>
        {t('cert.check')} →
      </Link>
    </div>
  );
}
