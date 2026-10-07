import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ARTICLE_KIND_KEY, ARTICLE_PERIOD_KEY, articleDate, coverUrl } from '@/components/article-card';
import { RichText } from '@/components/rich-text';
import { Chip } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { serverEnv } from '@/lib/env';
import { getI18n } from '@/lib/i18n';
import type { ArticleDetail } from '@/lib/types';

const load = cache(async (slug: string) => {
  try {
    return await api<ArticleDetail>(`/articles/${encodeURIComponent(slug)}`, { revalidate: 60, auth: false });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = await load(slug);
  if (!a) return {};
  const { localized } = await getI18n();
  const description = localized(a.summary) || undefined;
  const image = coverUrl(a, 1280);
  return {
    title: localized(a.title),
    description,
    alternates: { canonical: `/articles/${a.slug}` },
    openGraph: {
      type: 'article',
      title: localized(a.title),
      description,
      publishedTime: a.publishedAt,
      modifiedTime: a.updatedAt,
      ...(image ? { images: [image] } : {}),
    },
  };
}

/** One article (D-063): free to read here and in the app; Gorkhapatra summaries link to their source (D-018). */
export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await load(slug);
  if (!a) notFound();
  const { locale, t, localized, bsDate } = await getI18n();
  const doc = a.body[locale] ?? a.body.en ?? a.body.ne;
  const image = coverUrl(a, 1280);
  // Structured data so search engines show it as an article.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': a.kind === 'blog' ? 'BlogPosting' : 'NewsArticle',
    headline: localized(a.title),
    description: localized(a.summary),
    datePublished: a.publishedAt,
    dateModified: a.updatedAt,
    inLanguage: a.body.ne && !a.body.en ? 'ne' : 'en',
    mainEntityOfPage: `${serverEnv.siteUrl}/articles/${a.slug}`,
    publisher: { '@type': 'Organization', name: t('brand.name') },
    ...(image ? { image: [image] } : {}),
  };
  return (
    <article className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <p className="mb-3 text-sm">
        <Link href={`/articles?kind=${a.kind}`} className="text-link hover:underline">
          {t(ARTICLE_KIND_KEY[a.kind])}
        </Link>
      </p>
      <h1 className="text-3xl font-bold leading-tight tracking-tight text-text sm:text-4xl">
        {localized(a.title)}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-text-muted">
        <time dateTime={a.periodDate ?? a.publishedAt}>{bsDate(articleDate(a))}</time>
        {a.period ? <Chip>{t(ARTICLE_PERIOD_KEY[a.period])}</Chip> : null}
        {a.category ? <Chip>{localized(a.category.name)}</Chip> : null}
      </div>
      {image ? (
        <img src={image} alt="" className="mt-6 aspect-[16/9] w-full rounded-lg object-cover" />
      ) : null}
      <div className="mt-6">
        <RichText doc={doc} media={a.media} />
      </div>
      {a.sourceUrl ? (
        <p className="mt-8 rounded-md border border-border bg-surface p-4 text-sm">
          {t('articles.source')}{' '}
          <a
            href={a.sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="font-semibold text-link hover:underline"
          >
            {a.sourceName ?? new URL(a.sourceUrl).hostname}
          </a>
        </p>
      ) : a.sourceName ? (
        <p className="mt-8 text-sm text-text-secondary">
          {t('articles.source')} {a.sourceName}
        </p>
      ) : null}
      {a.quiz ? (
        <p className="mt-6 rounded-md bg-primary-soft p-4 text-sm text-on-primary-soft">
          {t('articles.quizInApp', { quiz: localized(a.quiz.title) })}
        </p>
      ) : null}
    </article>
  );
}
