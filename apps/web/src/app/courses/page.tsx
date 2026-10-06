import type { Metadata } from 'next';
import Link from 'next/link';
import { CourseCard } from '@/components/course-card';
import { button, input, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import type { CourseCard as Course } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('courses.title'), alternates: { canonical: '/courses' } };
}

/** Every published course (search by title; more pages by cursor). */
export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; after?: string }>;
}) {
  const { q, after } = await searchParams;
  const { locale, t, localized } = await getI18n();
  const params = new URLSearchParams({ limit: '24' });
  if (q?.trim()) params.set('q', q.trim());
  if (after) params.set('cursor', after);
  const list = await api<{ data: Course[]; nextCursor: string | null }>(`/courses?${params}`, {
    revalidate: 60,
  });
  const more = list.nextCursor
    ? `/courses?${new URLSearchParams({ ...(q ? { q } : {}), after: list.nextCursor })}`
    : null;
  return (
    <>
      <PageTitle>{t('courses.title')}</PageTitle>
      <form role="search" className="mb-6 flex max-w-lg gap-2">
        <input
          name="q"
          defaultValue={q ?? ''}
          aria-label={t('courses.search')}
          placeholder={t('courses.search')}
          className={input}
        />
        <button className={button.secondary}>{t('courses.search')}</button>
      </form>
      {list.data.length === 0 ? (
        <p className="text-text-secondary">{t('courses.empty')}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.map((c) => (
            <CourseCard key={c.id} course={c} locale={locale} t={t} localized={localized} />
          ))}
        </div>
      )}
      {more ? (
        <div className="mt-8">
          <Link href={more} className={button.secondary}>
            {t('courses.more')}
          </Link>
        </div>
      ) : null}
    </>
  );
}
