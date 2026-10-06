import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PriceTag } from '@/components/course-card';
import { RichText } from '@/components/rich-text';
import { Alert, button, Card } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import type { CourseDetail } from '@/lib/types';
import { validityText } from '@/lib/validity';

const load = cache(async (slug: string) => {
  try {
    return await api<CourseDetail>(`/courses/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const course = await load(slug);
  if (!course) return {};
  const { localized } = await getI18n();
  const description = localized(course.shortDescription) || undefined;
  return {
    title: localized(course.title),
    description,
    alternates: { canonical: `/courses/${course.slug}` },
    openGraph: {
      title: localized(course.title),
      description,
      ...(course.thumbnailUrl ? { images: [course.thumbnailUrl] } : {}),
    },
  };
}

/** A course page: what it contains and its price as the server sets them; Buy goes to checkout (D-027: web sells). */
export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await load(slug);
  if (!course) notFound();
  const { locale, t, localized, bsDate } = await getI18n();
  const doc = course.description
    ? (course.description[locale] ?? course.description.en ?? course.description.ne)
    : undefined;
  const counts = course.contentCounts;
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <article className="min-w-0">
        {course.thumbnailUrl ? (
          <img
            src={course.thumbnailUrl}
            alt=""
            className="mb-6 aspect-[16/9] w-full rounded-lg object-cover"
          />
        ) : null}
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-text">
          {localized(course.title)}
        </h1>
        {course.shortDescription ? (
          <p className="mt-3 text-lg text-text-secondary">{localized(course.shortDescription)}</p>
        ) : null}
        <p className="mt-3 text-sm text-text-muted">
          {t('course.counts', { notes: counts.note ?? 0, pdfs: counts.pdf ?? 0, videos: counts.video ?? 0 })}
        </p>

        {doc ? (
          <section aria-labelledby="about" className="mt-8">
            <h2 id="about" className="text-xl font-bold text-text">
              {t('course.about')}
            </h2>
            <RichText doc={doc} media={course.descriptionMedia} />
          </section>
        ) : null}

        {course.subjects.length ? (
          <section aria-labelledby="subjects" className="mt-8">
            <h2 id="subjects" className="mb-3 text-xl font-bold text-text">
              {t('course.subjects')}
            </h2>
            <ul className="flex flex-col gap-3">
              {course.subjects.map((s) => (
                <li key={s.id} className="rounded-md border border-border bg-surface p-4">
                  <p className="font-semibold text-text">{localized(s.name)}</p>
                  {s.summary ? <p className="text-sm text-text-secondary">{localized(s.summary)}</p> : null}
                  {s.fullMarks !== null && s.passMarks !== null ? (
                    <p className="mt-1 text-xs text-text-muted">
                      {t('course.marks', { full: s.fullMarks, pass: s.passMarks })}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {course.instructors.length ? (
          <section aria-labelledby="instructors" className="mt-8">
            <h2 id="instructors" className="mb-3 text-xl font-bold text-text">
              {t('course.instructors')}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {course.instructors.map((i) => (
                <li key={i.id} className="flex gap-3 rounded-md border border-border bg-surface p-4">
                  {i.photoUrl ? (
                    <img src={i.photoUrl} alt="" className="size-12 rounded-full object-cover" />
                  ) : null}
                  <div>
                    <p className="font-semibold text-text">{localized(i.displayName)}</p>
                    {i.bio ? <p className="text-sm text-text-secondary">{localized(i.bio)}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>

      <aside>
        <Card className="sticky top-6 flex flex-col gap-4">
          {course.isFree ? (
            <p className="text-2xl font-bold text-success">{t('course.free')}</p>
          ) : (
            <PriceTag pricing={course.pricing} locale={locale} large />
          )}
          <p className="text-sm text-text-secondary">{validityText(course.validity, t, bsDate)}</p>
          {course.access?.entitled ? (
            <Alert tone="success">{t('course.youHaveAccess')}</Alert>
          ) : course.isFree ? (
            <Alert tone="info">{t('course.freeInApp')}</Alert>
          ) : course.pricing ? (
            <Link href={`/checkout/${course.slug}`} className={button.primary}>
              {t('course.buy')}
            </Link>
          ) : (
            <Alert tone="info">{t('course.notForSale')}</Alert>
          )}
        </Card>
      </aside>
    </div>
  );
}
