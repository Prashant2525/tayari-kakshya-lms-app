import { formatNpr } from '@tk/domain';
import Link from 'next/link';
import type { Locale, Translate } from '@/lib/messages';
import type { CourseCard as Course, Pricing } from '@/lib/types';
import { RatingLine } from './reviews';

/** A price as the server sends it, the regular one struck through during a sale; nothing when none is sent (D-027). */
export function PriceTag({
  pricing,
  locale,
  large = false,
}: {
  pricing: Pricing | null;
  locale: Locale;
  large?: boolean;
}) {
  if (!pricing) return null;
  const sale = pricing.salePricePaisa !== null;
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className={large ? 'text-2xl font-bold text-text' : 'font-semibold text-text'}>
        {formatNpr(pricing.effectivePricePaisa, locale)}
      </span>
      {sale ? (
        <span className="text-sm text-text-muted line-through">{formatNpr(pricing.pricePaisa, locale)}</span>
      ) : null}
    </span>
  );
}

export function CourseCard({
  course,
  locale,
  t,
  localized,
}: {
  course: Course;
  locale: Locale;
  t: Translate;
  localized: (text: Course['title'] | null) => string;
}) {
  const title = localized(course.title);
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-e1 transition-shadow hover:shadow-e2"
    >
      <div className="aspect-[16/9] bg-primary-soft">
        {course.thumbnailUrl ? (
          <img src={course.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div
            aria-hidden
            className="flex h-full items-center justify-center text-3xl font-bold text-on-primary-soft"
          >
            {title.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-semibold leading-snug text-text group-hover:text-link">{title}</h3>
        {course.shortDescription ? (
          <p className="line-clamp-2 text-sm text-text-secondary">{localized(course.shortDescription)}</p>
        ) : null}
        <RatingLine rating={course.rating} t={t} />
        <div className="mt-auto pt-1">
          {course.isFree ? (
            <span className="font-semibold text-success">{t('course.free')}</span>
          ) : (
            <PriceTag pricing={course.pricing} locale={locale} />
          )}
        </div>
      </div>
    </Link>
  );
}
