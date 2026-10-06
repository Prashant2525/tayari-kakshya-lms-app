import type { Metadata } from 'next';
import Link from 'next/link';
import { PriceTag } from '@/components/course-card';
import { button, Chip, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import type { PlanView } from '@/lib/types';
import { validityText } from '@/lib/validity';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('plans.title'), alternates: { canonical: '/plans' } };
}

/** "Choose your plan" (PDF p23, D-023): everything shown comes from the CMS. */
export default async function PlansPage() {
  const { locale, t, localized, bsDate } = await getI18n();
  const plans = await api<PlanView[]>('/plans');
  return (
    <>
      <PageTitle sub={t('plans.subtitle')}>{t('plans.title')}</PageTitle>
      {plans.length === 0 ? (
        <p className="text-text-secondary">{t('plans.empty')}</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => {
            const name = localized(p.name);
            const lifetimeMine = p.mine && p.mine.endsAt === null;
            return (
              <section
                key={p.id}
                aria-label={name}
                className={`flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-e1 ${p.isFeatured ? 'border-2 border-primary' : 'border border-border'}`}
              >
                {p.isFeatured || p.mine ? (
                  <div className="flex flex-wrap gap-2">
                    {p.mine ? (
                      <Chip tone="success">
                        {p.mine.endsAt
                          ? t('plans.mineUntil', { date: bsDate(p.mine.endsAt) })
                          : t('plans.mine')}
                      </Chip>
                    ) : null}
                    {p.isFeatured ? <Chip tone="premium">★ {t('plans.featured')}</Chip> : null}
                  </div>
                ) : null}
                <h2 className="text-xl font-bold text-text">{name}</h2>
                {p.description ? <p className="text-text-secondary">{localized(p.description)}</p> : null}
                <div>
                  {p.isFree ? (
                    <span className="text-xl font-bold text-success">{t('course.free')}</span>
                  ) : (
                    <PriceTag pricing={p.pricing} locale={locale} large />
                  )}
                  <p className="text-sm text-text-secondary">{validityText(p.validity, t, bsDate)}</p>
                </div>
                {p.features.length ? (
                  <ul className="flex flex-col gap-1.5">
                    {p.features.map((f, i) => (
                      <li key={i} className="flex gap-2 text-text">
                        <span aria-hidden className="font-bold text-success">
                          ✓
                        </span>
                        {localized(f)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="border-t border-border pt-3 text-sm">
                  <p className="font-semibold text-text">{t('plans.includes')}</p>
                  <p className="text-text-secondary">
                    {p.coverage === 'all_courses'
                      ? t('plans.allCourses')
                      : p.courses.map((c) => localized(c.title)).join(' · ')}
                  </p>
                </div>
                {!p.isFree && p.pricing && !lifetimeMine ? (
                  <Link href={`/checkout/plan/${p.slug}`} className={`${button.primary} mt-auto`}>
                    {p.mine ? t('plans.renew') : t('plans.choose')}
                  </Link>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
