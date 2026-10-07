import { useQuery } from '@tanstack/react-query';
import type { ContactType, LocalizedText, PageSlug } from '@tk/contracts';
import { api } from './client';
import type { MediaMap, RichNode } from './learning';

/** Help & support (D-034, D-064) and the static pages (D-038). */

export interface PageLink {
  slug: PageSlug;
  title: LocalizedText;
}

export interface StaticPage extends PageLink {
  body: { en?: RichNode; ne?: RichNode };
  media: MediaMap;
  version: number;
  publishedAt: string;
}

export interface Faq {
  id: string;
  question: LocalizedText;
  answer: LocalizedText;
}

export interface ContactOption {
  id: string;
  type: ContactType;
  label: LocalizedText;
  value: string;
  note: LocalizedText | null;
}

export function usePages() {
  return useQuery({
    queryKey: ['pages'],
    queryFn: () => api.get<PageLink[]>('/pages'),
    staleTime: 10 * 60_000,
  });
}

export function usePage(slug: string) {
  return useQuery({ queryKey: ['page', slug], queryFn: () => api.get<StaticPage>(`/pages/${slug}`) });
}

export function useFaqs() {
  return useQuery({ queryKey: ['faqs'], queryFn: () => api.get<Faq[]>('/faqs') });
}

export function useContactOptions() {
  return useQuery({
    queryKey: ['contact-options'],
    queryFn: () => api.get<ContactOption[]>('/contact-options'),
  });
}

/** What opens when a contact option is tapped (none for an address). */
export function contactHref(c: Pick<ContactOption, 'type' | 'value'>): string | null {
  const digits = c.value.replace(/[^0-9+]/g, '');
  switch (c.type) {
    case 'phone':
      return `tel:${digits}`;
    case 'whatsapp':
      return `https://wa.me/${digits.replace(/^\+/, '')}`;
    case 'viber':
      return `viber://chat?number=${encodeURIComponent(digits)}`;
    case 'email':
      return `mailto:${c.value}`;
    case 'website':
    case 'facebook':
      return c.value;
    case 'address':
      return null;
  }
}
