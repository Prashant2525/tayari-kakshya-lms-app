import type { Metadata } from 'next';
import Link from 'next/link';
import { ARTICLE_KIND_KEY, ARTICLE_PERIOD_KEY, ArticleCard } from '@/components/article-card';
import { button, PageTitle } from '@/components/ui';
import { api } from '@/lib/api';
import { getI18n } from '@/lib/i18n';
import type { ArticleCard as Article } from '@/lib/types';

const KINDS = ['current_affairs', 'gorkhapatra', 'news', 'blog'] as const;
const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
type Kind = (typeof KINDS)[number];
type Period = (typeof PERIODS)[number];

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}): Promise<Metadata> {
  const { kind } = await searchParams;
  const { t } = await getI18n();
  const k = KINDS.find((x) => x === kind);
  return {
    title: k ? t(ARTICLE_KIND_KEY[k]) : t('articles.title'),
    description: t('articles.intro'),
    alternates: { canonical: k ? `/articles?kind=${k}` : '/articles' },
  };
}

/** Current affairs, Gorkhapatra summaries, news and blog (D-063): free for everyone, newest first. */
export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; period?: string; after?: string }>;
}) {
  const sp = await searchParams;
  const kind = KINDS.find((x) => x === sp.kind) as Kind | undefined;
  const period =
    kind === 'current_affairs' ? (PERIODS.find((x) => x === sp.period) as Period | undefined) : undefined;
  const { t, localized, bsDate } = await getI18n();
  const params = new URLSearchParams({ limit: '24' });
  if (kind) params.set('kind', kind);
  if (period) params.set('period', period);
  if (sp.after) params.set('cursor', sp.after);
  const list = await api<{ data: Article[]; nextCursor: string | null }>(`/articles?${params}`, {
    revalidate: 60,
    auth: false,
  });
  const href = (next: { kind?: Kind | undefined; period?: Period | undefined; after?: string }) => {
    const q = new URLSearchParams();
    if (next.kind) q.set('kind', next.kind);
    if (next.period) q.set('period', next.period);
    if (next.after) q.set('after', next.after);
    const s = q.toString();
    return s ? `/articles?${s}` : '/articles';
  };
  const tab = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm ${
      active
        ? 'border-primary bg-primary-soft font-semibold text-on-primary-soft'
        : 'border-border bg-surface text-text hover:bg-surface-muted'
    }`;
  return (
    <>
      <PageTitle sub={t('articles.intro')}>
        {kind ? t(ARTICLE_KIND_KEY[kind]) : t('articles.title')}
      </PageTitle>
      <nav aria-label={t('articles.kinds')} className="mb-4 flex flex-wrap gap-2">
        <Link href={href({})} className={tab(!kind)} aria-current={!kind ? 'page' : undefined}>
          {t('articles.all')}
        </Link>
        {KINDS.map((k) => (
          <Link
            key={k}
            href={href({ kind: k })}
            className={tab(kind === k)}
            aria-current={kind === k ? 'page' : undefined}
          >
            {t(ARTICLE_KIND_KEY[k])}
          </Link>
        ))}
      </nav>
      {kind === 'current_affairs' ? (
        <nav aria-label={t('articles.periods')} className="mb-6 flex flex-wrap gap-2">
          <Link href={href({ kind })} className={tab(!period)} aria-current={!period ? 'page' : undefined}>
            {t('articles.allPeriods')}
          </Link>
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={href({ kind, period: p })}
              className={tab(period === p)}
              aria-current={period === p ? 'page' : undefined}
            >
              {t(ARTICLE_PERIOD_KEY[p])}
            </Link>
          ))}
        </nav>
      ) : (
        <div className="mb-2" />
      )}
      {list.data.length === 0 ? (
        <p className="text-text-secondary">{t('articles.empty')}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.map((a) => (
            <ArticleCard key={a.id} article={a} t={t} localized={localized} bsDate={bsDate} />
          ))}
        </div>
      )}
      {list.nextCursor ? (
        <div className="mt-8">
          <Link href={href({ kind, period, after: list.nextCursor })} className={button.secondary}>
            {t('articles.more')}
          </Link>
        </div>
      ) : null}
    </>
  );
}
