import type { LocalizedText } from '@tk/contracts';
import Link from 'next/link';
import type { MessageKey, Translate } from '@/lib/messages';
import type { ArticleCard as Article } from '@/lib/types';

export const ARTICLE_KIND_KEY: Record<Article['kind'], MessageKey> = {
  current_affairs: 'articles.kind.current_affairs',
  gorkhapatra: 'articles.kind.gorkhapatra',
  news: 'articles.kind.news',
  blog: 'articles.kind.blog',
};

export const ARTICLE_PERIOD_KEY: Record<NonNullable<Article['period']>, MessageKey> = {
  daily: 'articles.period.daily',
  weekly: 'articles.period.weekly',
  monthly: 'articles.period.monthly',
  yearly: 'articles.period.yearly',
};

/** The date an article is about: the digest's date or the issue date (Nepal), else when it was published. */
export const articleDate = (a: Pick<Article, 'periodDate' | 'publishedAt'>) =>
  a.periodDate ? `${a.periodDate}T12:00:00+05:45` : a.publishedAt;

export const coverUrl = (a: Pick<Article, 'cover'>, width: 320 | 640 | 1280) =>
  a.cover ? (a.cover.variants[`w${width}`] ?? a.cover.variants['w640'] ?? a.cover.url) : null;

/** One article in a list: picture, kind, date, title and summary. */
export function ArticleCard({
  article: a,
  t,
  localized,
  bsDate,
}: {
  article: Article;
  t: Translate;
  localized: (text: LocalizedText | null | undefined) => string;
  bsDate: (iso: string) => string;
}) {
  const img = coverUrl(a, 640);
  const meta = [
    t(ARTICLE_KIND_KEY[a.kind]),
    a.period ? t(ARTICLE_PERIOD_KEY[a.period]) : null,
    a.category ? localized(a.category.name) : null,
    bsDate(articleDate(a)),
  ].filter(Boolean);
  return (
    <Link
      href={`/articles/${a.slug}`}
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition hover:shadow-e2"
    >
      {img ? <img src={img} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" /> : null}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{meta.join(' · ')}</p>
        <h3 className="text-lg font-bold leading-snug text-text">{localized(a.title)}</h3>
        <p className="line-clamp-3 text-sm text-text-secondary">{localized(a.summary)}</p>
      </div>
    </Link>
  );
}
