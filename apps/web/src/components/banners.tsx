import type { LocalizedText, PageSlug } from '@tk/contracts';
import Link from 'next/link';
import { PAGE_PATH } from '@/lib/pages';

export interface Banner {
  id: string;
  title: LocalizedText;
  image: { url: string; variants: Record<string, string> };
  link: { type: 'course' | 'plan' | 'article' | 'page' | 'url'; value: string } | null;
}

function hrefOf(link: NonNullable<Banner['link']>): string {
  switch (link.type) {
    case 'course':
      return `/courses/${link.value}`;
    case 'plan':
      return '/plans';
    case 'article':
      return `/articles/${link.value}`;
    case 'page':
      return PAGE_PATH[link.value as PageSlug] ?? '/';
    case 'url':
      return link.value;
  }
}

/** Banners from the CMS (D-064) on the home page: a row that scrolls sideways on small screens. */
export function Banners({
  banners,
  localized,
  label,
}: {
  banners: Banner[];
  localized: (text: LocalizedText | null | undefined) => string;
  label: string;
}) {
  if (!banners.length) return null;
  return (
    <section aria-label={label}>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2">
        {banners.map((b) => {
          const title = localized(b.title);
          const img = (
            <img
              src={b.image.variants['w1280'] ?? b.image.variants['w640'] ?? b.image.url}
              srcSet={['w640', 'w1280']
                .filter((w) => b.image.variants[w])
                .map((w) => `${b.image.variants[w]} ${w.slice(1)}w`)
                .join(', ')}
              sizes="(min-width: 1024px) 50vw, 90vw"
              alt={title}
              className={`aspect-[16/7] w-full rounded-lg object-cover ${banners.length === 1 ? 'lg:aspect-[3/1]' : ''}`}
            />
          );
          const external = b.link?.type === 'url';
          return (
            <li
              key={b.id}
              className={`shrink-0 snap-start ${banners.length > 1 ? 'w-[90%] lg:w-[calc(50%-0.5rem)]' : 'w-full'}`}
            >
              {b.link ? (
                external ? (
                  <a href={hrefOf(b.link)} target="_blank" rel="noopener noreferrer">
                    {img}
                  </a>
                ) : (
                  <Link href={hrefOf(b.link)}>{img}</Link>
                )
              ) : (
                img
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
