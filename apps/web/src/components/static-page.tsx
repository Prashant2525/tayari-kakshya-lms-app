import type { LocalizedText, PageSlug } from '@tk/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { RichText } from '@/components/rich-text';
import { api, ApiError } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import { PAGE_PATH } from '@/lib/pages';
import type { RichNode } from '@/lib/types';

interface StaticPage {
  slug: PageSlug;
  title: LocalizedText;
  body: { en?: RichNode; ne?: RichNode };
  media: Record<string, { url: string; variants: Record<string, string> }>;
  version: number;
  publishedAt: string;
}

const load = cache(async (slug: PageSlug) => {
  try {
    return await api<StaticPage>(`/pages/${slug}`, { revalidate: 60, auth: false });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
});

export async function staticPageMetadata(slug: PageSlug): Promise<Metadata> {
  const page = await load(slug);
  if (!page) return {};
  const { localized } = await getI18n();
  return { title: localized(page.title), alternates: { canonical: PAGE_PATH[slug] } };
}

/** About, Terms, Privacy or Refund (D-038): the last published version; 404 until one is published. */
export async function StaticPageView({ slug }: { slug: PageSlug }) {
  const page = await load(slug);
  if (!page) notFound();
  const { locale, t, localized, bsDate } = await getI18n();
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold leading-tight tracking-tight text-text">{localized(page.title)}</h1>
      <p className="mt-2 text-sm text-text-muted">{t('pages.updated', { date: bsDate(page.publishedAt) })}</p>
      <div className="mt-6">
        <RichText doc={page.body[locale] ?? page.body.en ?? page.body.ne} media={page.media} />
      </div>
    </article>
  );
}
