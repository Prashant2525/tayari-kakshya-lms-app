import { afterEach, describe, expect, it, vi } from 'vitest';
import sitemap from './sitemap';

const page = (data: unknown[], nextCursor: string | null = null) =>
  new Response(JSON.stringify({ data, nextCursor }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('sitemap (search engines)', () => {
  it('lists the fixed pages, every course and every article, page after page', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.includes('/courses?')) return page([{ slug: 'sainey-likhit' }]);
        if (url.includes('/articles?') && !url.includes('cursor=')) {
          return page([{ slug: 'budget-week', publishedAt: '2026-10-07T00:00:00.000Z' }], 'c1');
        }
        return page([{ slug: 'gorkhapatra-21-asoj', publishedAt: '2026-10-06T00:00:00.000Z' }]);
      }),
    );
    const urls = (await sitemap()).map((e) => e.url.replace(/^https?:\/\/[^/]+/, ''));
    expect(urls).toEqual([
      '/',
      '/courses',
      '/plans',
      '/articles',
      '/courses/sainey-likhit',
      '/articles/budget-week',
      '/articles/gorkhapatra-21-asoj',
    ]);
    expect(calls.filter((u) => u.includes('/articles?'))).toHaveLength(2);
  });

  it('still lists the fixed pages when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('fetch failed'))),
    );
    expect((await sitemap()).map((e) => e.url.replace(/^https?:\/\/[^/]+/, ''))).toEqual([
      '/',
      '/courses',
      '/plans',
      '/articles',
    ]);
  });
});
