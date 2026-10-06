import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/components/i18n-provider';
import { LanguageToggle } from '@/components/language-toggle';
import { signedIn } from '@/lib/api';
import { serverEnv } from '@/lib/env';
import { getI18n } from '@/lib/i18n';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    metadataBase: new URL(serverEnv.siteUrl),
    title: { default: t('brand.name'), template: `%s · ${t('brand.name')}` },
    description: t('brand.tagline'),
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, t } = await getI18n();
  const account = await signedIn();
  return (
    <html lang={locale}>
      <body className="flex min-h-dvh flex-col">
        <I18nProvider locale={locale}>
          <header className="border-b border-border bg-surface">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
              <Link href="/" className="text-lg font-bold text-brand">
                {t('brand.name')}
              </Link>
              <nav aria-label={t('nav.main')} className="flex flex-1 items-center gap-1">
                <Link
                  href="/courses"
                  className="rounded-md px-3 py-2 text-[15px] font-medium text-text hover:bg-surface-muted"
                >
                  {t('nav.courses')}
                </Link>
                <Link
                  href="/plans"
                  className="rounded-md px-3 py-2 text-[15px] font-medium text-text hover:bg-surface-muted"
                >
                  {t('nav.plans')}
                </Link>
              </nav>
              <div className="flex items-center gap-1">
                <LanguageToggle />
                <Link
                  href={account ? '/account' : '/login'}
                  className="rounded-md px-3 py-2 text-[15px] font-semibold text-link hover:bg-surface-muted"
                >
                  {account ? t('nav.account') : t('nav.signIn')}
                </Link>
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
          <footer className="border-t border-border bg-surface">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-text-secondary">
              <p>
                © {new Date().getFullYear()} {t('brand.name')} · {t('footer.app')}
              </p>
              <Link href="/certificates" className="font-medium text-link">
                {t('footer.verify')}
              </Link>
            </div>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
