import Link from 'next/link';
import { CourseCard } from '@/components/course-card';
import { button } from '@/components/ui';
import { api } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import type { CourseCard as Course } from '@/lib/types';

/** Home: what the CMS features, and the way to every course and plan. */
export default async function HomePage() {
  const { locale, t, localized } = await getI18n();
  const featured = await api<{ data: Course[] }>('/courses?featured=true&limit=6', { revalidate: 60 }).catch(
    () => ({ data: [] }),
  );
  return (
    <div className="flex flex-col gap-12">
      <section className="rounded-xl bg-brand px-6 py-12 text-on-brand sm:px-10">
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{t('brand.name')}</h1>
        <p className="mt-3 max-w-2xl text-lg opacity-90">{t('brand.tagline')}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/courses" className={button.primary}>
            {t('home.allCourses')}
          </Link>
          <Link href="/plans" className={button.secondary}>
            {t('home.seePlans')}
          </Link>
        </div>
      </section>

      {featured.data.length ? (
        <section aria-labelledby="featured">
          <h2 id="featured" className="mb-4 text-2xl font-bold text-text">
            {t('home.featured')}
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.data.map((c) => (
              <CourseCard key={c.id} course={c} locale={locale} t={t} localized={localized} />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="plans" className="rounded-lg border border-border bg-surface p-6">
        <h2 id="plans" className="text-xl font-bold text-text">
          {t('home.plans')}
        </h2>
        <p className="mt-1 text-text-secondary">{t('home.plansBody')}</p>
        <Link href="/plans" className={`${button.link} mt-3 inline-block`}>
          {t('home.seePlans')} →
        </Link>
      </section>
    </div>
  );
}
