import type { MetadataRoute } from 'next';
import { serverEnv } from '@/lib/env';
import type { CourseCard } from '@/lib/types';

const API = `${(process.env['API_BASE_URL'] || 'http://localhost:4000').replace(/\/+$/, '')}/api/v1`;

/** Public pages for search engines: home, plans, every published course and article (refreshed hourly). */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = serverEnv.siteUrl;
  const pages: MetadataRoute.Sitemap = [
    { url: `${site}/`, changeFrequency: 'daily' },
    { url: `${site}/courses`, changeFrequency: 'daily' },
    { url: `${site}/plans`, changeFrequency: 'weekly' },
    { url: `${site}/articles`, changeFrequency: 'daily' },
  ];
  let cursor: string | null = null;
  try {
    do {
      const qs: string = new URLSearchParams({ limit: '100', ...(cursor ? { cursor } : {}) }).toString();
      const res = await fetch(`${API}/courses?${qs}`, {
        headers: { 'X-TK-Platform': 'web' },
        next: { revalidate },
      });
      if (!res.ok) break;
      const page = (await res.json()) as { data: CourseCard[]; nextCursor: string | null };
      for (const c of page.data) pages.push({ url: `${site}/courses/${c.slug}`, changeFrequency: 'weekly' });
      cursor = page.nextCursor;
    } while (cursor);
    cursor = null;
    do {
      const qs: string = new URLSearchParams({ limit: '100', ...(cursor ? { cursor } : {}) }).toString();
      const res = await fetch(`${API}/articles?${qs}`, {
        headers: { 'X-TK-Platform': 'web' },
        next: { revalidate },
      });
      if (!res.ok) break;
      const page = (await res.json()) as {
        data: Array<{ slug: string; publishedAt: string }>;
        nextCursor: string | null;
      };
      for (const a of page.data) {
        pages.push({
          url: `${site}/articles/${a.slug}`,
          lastModified: a.publishedAt,
          changeFrequency: 'monthly',
        });
      }
      cursor = page.nextCursor;
    } while (cursor);
  } catch {
    // The API is unreachable: the static pages are still listed.
  }
  return pages;
}
