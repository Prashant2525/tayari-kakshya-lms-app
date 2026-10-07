import 'server-only';
import type { LocalizedText, PageSlug } from '@tk/contracts';
import { api } from './api';

/** Where each static page lives on the website (D-038). */
export const PAGE_PATH: Record<PageSlug, string> = {
  about: '/about',
  terms: '/terms',
  privacy: '/privacy',
  refund: '/refund-policy',
};

export interface PageLink {
  slug: PageSlug;
  title: LocalizedText;
}

/** The published pages (footer, sign-up), refreshed every minute; none when the API cannot be reached. */
export async function publishedPages(): Promise<PageLink[]> {
  return api<PageLink[]>('/pages', { revalidate: 60, auth: false }).catch(() => []);
}
