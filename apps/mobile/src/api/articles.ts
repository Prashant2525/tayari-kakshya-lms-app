import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { ArticleKind, ArticlePeriod, LocalizedText } from '@tk/contracts';
import { api } from './client';
import type { MediaMap, RichNode } from './learning';

/** Articles (§12, D-063): current affairs, Gorkhapatra summaries, news and blog — free for everyone. */

type Image = { url: string; variants: Record<string, string> };

export interface ArticleCard {
  id: string;
  kind: ArticleKind;
  slug: string;
  title: LocalizedText;
  summary: LocalizedText;
  cover: Image | null;
  category: { id: string; name: LocalizedText } | null;
  period: ArticlePeriod | null;
  periodDate: string | null;
  sourceName: string | null;
  isFeatured: boolean;
  publishedAt: string;
}

export interface ArticleDetail extends ArticleCard {
  body: { en?: RichNode; ne?: RichNode };
  media: MediaMap;
  sourceUrl: string | null;
  quiz: { id: string; type: string; title: LocalizedText } | null;
  updatedAt: string;
}

export interface ArticleCategory {
  id: string;
  kind: ArticleKind;
  name: LocalizedText;
}

type Page<T> = { data: T[]; nextCursor: string | null };

export function useArticles(filter: {
  kind?: ArticleKind;
  period?: ArticlePeriod;
  categoryId?: string;
  featured?: boolean;
}) {
  return useInfiniteQuery({
    queryKey: ['articles', filter],
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams({ limit: '20' });
      if (filter.kind) q.set('kind', filter.kind);
      if (filter.period) q.set('period', filter.period);
      if (filter.categoryId) q.set('categoryId', filter.categoryId);
      if (filter.featured) q.set('featured', 'true');
      if (pageParam) q.set('cursor', pageParam);
      return api.get<Page<ArticleCard>>(`/articles?${q.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useArticle(slug: string) {
  return useQuery({
    queryKey: ['article', slug],
    queryFn: () => api.get<ArticleDetail>(`/articles/${slug}`),
  });
}

export function useArticleCategories(kind: ArticleKind) {
  return useQuery({
    queryKey: ['article-categories', kind],
    queryFn: () => api.get<ArticleCategory[]>(`/article-categories?kind=${kind}`),
    staleTime: 10 * 60_000,
  });
}

/** The date an article is about: the digest's date or the issue date, else when it was published. */
export const articleDate = (a: Pick<ArticleCard, 'periodDate' | 'publishedAt'>) =>
  a.periodDate ? `${a.periodDate}T12:00:00+05:45` : a.publishedAt;

export const coverUri = (img: Image | null, width: 320 | 640 | 1280) =>
  img ? (img.variants[`w${width}`] ?? img.variants['w640'] ?? img.url) : null;
