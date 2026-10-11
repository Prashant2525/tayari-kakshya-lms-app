import type { Translate } from '@/lib/messages';
import type { CourseReviewsPage, RatingSummary } from '@/lib/types';

/** Five stars as text, filled up to the rounded rating; decorative (the label says the rating). */
export function StarText({ rating, className = '' }: { rating: number; className?: string }) {
  const full = Math.round(rating);
  return (
    <span aria-hidden className={`tracking-tight ${className}`}>
      <span className="text-warning">{'★'.repeat(full)}</span>
      <span className="text-text-muted">{'★'.repeat(5 - full)}</span>
    </span>
  );
}

/** "★★★★☆ 4.5 (12)" on course cards and the course page; nothing until a review is approved (D-066). */
export function RatingLine({ rating, t }: { rating: RatingSummary | null; t: Translate }) {
  if (!rating || rating.count === 0) return null;
  return (
    <p className="flex items-center gap-1.5 text-sm text-text-secondary">
      <span className="sr-only">
        {rating.count === 1
          ? t('reviews.ratedOne', { average: rating.average })
          : t('reviews.rated', { average: rating.average, count: rating.count })}
      </span>
      <StarText rating={rating.average} />
      <span aria-hidden>
        {rating.average} ({rating.count})
      </span>
    </p>
  );
}

/** The course page's reviews: the rating with how many gave each star, and the latest approved reviews. */
export function CourseReviews({
  page,
  t,
  bsDate,
}: {
  page: CourseReviewsPage;
  t: Translate;
  bsDate: (iso: string) => string;
}) {
  const { summary, data } = page;
  return (
    <section aria-labelledby="reviews" className="mt-8">
      <h2 id="reviews" className="mb-3 text-xl font-bold text-text">
        {t('reviews.title')}
      </h2>
      {summary.count === 0 ? (
        <p className="text-text-secondary">{t('reviews.none')}</p>
      ) : (
        <div className="mb-4 flex flex-wrap items-center gap-6 rounded-md border border-border bg-surface p-4">
          <div>
            <p className="text-4xl font-bold text-text">{summary.average}</p>
            <StarText rating={summary.average} className="text-lg" />
            <p className="text-sm text-text-muted">
              {summary.count === 1 ? t('reviews.countOne') : t('reviews.count', { count: summary.count })}
            </p>
            <p className="sr-only">
              {summary.count === 1
                ? t('reviews.ratedOne', { average: summary.average })
                : t('reviews.rated', { average: summary.average, count: summary.count })}
            </p>
          </div>
          <ul className="flex min-w-48 flex-1 flex-col gap-1">
            {(['5', '4', '3', '2', '1'] as const).map((n) => (
              <li key={n} className="flex items-center gap-2 text-sm text-text-secondary">
                <span className="w-10">{t('reviews.stars', { n })}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-warning"
                    style={{ width: `${(summary.stars[n] / summary.count) * 100}%` }}
                  />
                </span>
                <span className="w-8 text-right">{summary.stars[n]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.length ? (
        <ul className="flex flex-col gap-3">
          {data.map((r) => (
            <li key={r.id} className="rounded-md border border-border bg-surface p-4">
              <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
                <span className="sr-only">{t('reviews.starsOf', { n: r.rating })}</span>
                <StarText rating={r.rating} />
                <span>
                  {r.author ?? t('reviews.anonymous')} · {bsDate(r.createdAt)}
                </span>
              </p>
              {r.body ? <p className="mt-2 whitespace-pre-line text-text">{r.body}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-sm text-text-muted">{t('reviews.howTo')}</p>
    </section>
  );
}
