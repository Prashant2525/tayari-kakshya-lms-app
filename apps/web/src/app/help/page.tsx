import type { LocalizedText } from '@tk/contracts';
import type { Metadata } from 'next';
import { PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { getI18n } from '@/lib/i18n';

interface Faq {
  id: string;
  question: LocalizedText;
  answer: LocalizedText;
}

interface Contact {
  id: string;
  type: 'phone' | 'whatsapp' | 'viber' | 'email' | 'website' | 'facebook' | 'address';
  label: LocalizedText;
  value: string;
  note: LocalizedText | null;
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('help.title'), alternates: { canonical: '/help' } };
}

function hrefOf(c: Contact): string | null {
  const digits = c.value.replace(/[^0-9+]/g, '');
  switch (c.type) {
    case 'phone':
      return `tel:${digits}`;
    case 'whatsapp':
      return `https://wa.me/${digits.replace(/^\+/, '')}`;
    case 'viber':
      return `viber://chat?number=${encodeURIComponent(digits)}`;
    case 'email':
      return `mailto:${c.value}`;
    case 'website':
    case 'facebook':
      return c.value;
    case 'address':
      return null;
  }
}

/** Help & support (D-034, D-064): how to reach the team, and the FAQs. */
export default async function HelpPage() {
  const { t, localized } = await getI18n();
  const opts = { revalidate: 60, auth: false } as const;
  const [contacts, faqs] = await Promise.all([
    api<Contact[]>('/contact-options', opts).catch(() => [] as Contact[]),
    api<Faq[]>('/faqs', opts).catch(() => [] as Faq[]),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle>{t('help.title')}</PageTitle>
      <section aria-labelledby="contact" className="mb-10">
        <h2 id="contact" className="mb-3 text-xl font-bold text-text">
          {t('help.contact')}
        </h2>
        {contacts.length === 0 ? (
          <p className="text-text-secondary">{t('help.noContacts')}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {contacts.map((c) => {
              const href = hrefOf(c);
              return (
                <li key={c.id} className="rounded-md border border-border bg-surface p-4">
                  <p className="font-semibold text-text">{localized(c.label)}</p>
                  {href ? (
                    <a
                      href={href}
                      className="break-all text-link hover:underline"
                      {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    >
                      {c.value}
                    </a>
                  ) : (
                    <p className="text-text-secondary">{c.value}</p>
                  )}
                  {c.note ? <p className="mt-1 text-sm text-text-muted">{localized(c.note)}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section aria-labelledby="faqs">
        <h2 id="faqs" className="mb-3 text-xl font-bold text-text">
          {t('help.faqs')}
        </h2>
        {faqs.length === 0 ? (
          <p className="text-text-secondary">{t('help.noFaqs')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {faqs.map((f) => (
              <details key={f.id} className="group rounded-md border border-border bg-surface p-4">
                <summary className="cursor-pointer font-semibold text-text">{localized(f.question)}</summary>
                <p className="mt-2 whitespace-pre-line text-text-secondary">{localized(f.answer)}</p>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
