import type { LocalizedText, PublishStatus } from '@tk/contracts';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus, Star, Tags } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/content/status';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  Switch,
} from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { STATUS_LABEL, toLocalized, type CursorPage } from '@/lib/content';
import { formatDateBs, formatDateTimeBs, localized } from '@/lib/format';

export const ARTICLE_KIND = {
  current_affairs: 'Current affairs',
  gorkhapatra: 'Gorkhapatra',
  news: 'News',
  blog: 'Blog',
} as const;
export type ArticleKindName = keyof typeof ARTICLE_KIND;

export const ARTICLE_PERIOD = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
} as const;
export type ArticlePeriodName = keyof typeof ARTICLE_PERIOD;

export interface ArticleRow {
  id: string;
  kind: ArticleKindName;
  slug: string;
  title: LocalizedText;
  category: { id: string; name: LocalizedText } | null;
  period: ArticlePeriodName | null;
  periodDate: string | null;
  isFeatured: boolean;
  notify: boolean;
  notifiedAt: string | null;
  status: PublishStatus;
  publishAt: string | null;
  live: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryRow {
  id: string;
  kind: ArticleKindName;
  name: LocalizedText;
  sortOrder: number;
  active: boolean;
  articles: number;
}

/** Articles (§12, D-063): current affairs, Gorkhapatra summaries, news and blog — in the app and on the website. */
export function ArticlesPage() {
  const { can } = useAuth();
  const [kind, setKind] = useState<'' | ArticleKindName>('');
  const [status, setStatus] = useState<'' | PublishStatus>('');
  const [q, setQ] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const [categories, setCategories] = useState(false);
  const cursor = cursors.at(-1);
  const list = useQuery({
    queryKey: ['articles', kind, status, q, cursor],
    queryFn: ({ signal }) =>
      api.get<CursorPage<ArticleRow>>(
        '/admin/articles',
        { kind: kind || undefined, status: status || undefined, q: q.trim() || undefined, cursor, limit: 25 },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  const reset = () => setCursors([]);
  return (
    <>
      <PageHeader
        title="Articles"
        description="Current affairs, Gorkhapatra summaries, news and blog. Free for everyone, in the app and on the website."
        actions={
          <>
            {can('articles:publish') ? (
              <Button variant="secondary" onClick={() => setCategories(true)}>
                <Tags /> Categories
              </Button>
            ) : null}
            <Button asChild>
              <Link to="/articles/$articleId" params={{ articleId: 'new' }}>
                <Plus /> New article
              </Link>
            </Button>
          </>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <Select
            aria-label="Kind"
            className="w-48"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as typeof kind);
              reset();
            }}
          >
            <option value="">All kinds</option>
            {(Object.keys(ARTICLE_KIND) as ArticleKindName[]).map((k) => (
              <option key={k} value={k}>
                {ARTICLE_KIND[k]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Status"
            className="w-44"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              reset();
            }}
          >
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABEL) as PublishStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Input
            aria-label="Search"
            placeholder="Search titles"
            className="w-56"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              reset();
            }}
          />
        </div>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.data.length === 0 ? (
          <EmptyState
            title="No articles yet"
            description="Write one and publish it to show it in the app and on the website."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Article</TH>
                  <TH>Kind</TH>
                  <TH>Date</TH>
                  <TH>Push / email</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {list.data.data.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <Link
                        to="/articles/$articleId"
                        params={{ articleId: a.id }}
                        className="font-medium text-link"
                      >
                        {localized(a.title)}
                      </Link>
                      {a.isFeatured ? (
                        <Star aria-label="Featured" className="ml-2 inline size-4 text-text-muted" />
                      ) : null}
                      <div className="text-xs text-text-muted">/articles/{a.slug}</div>
                    </TD>
                    <TD className="text-sm">
                      {ARTICLE_KIND[a.kind]}
                      {a.period ? ` · ${ARTICLE_PERIOD[a.period]}` : ''}
                      {a.category ? (
                        <div className="text-xs text-text-muted">{localized(a.category.name)}</div>
                      ) : null}
                    </TD>
                    <TD className="whitespace-nowrap text-sm">
                      {a.periodDate
                        ? formatDateBs(a.periodDate)
                        : formatDateTimeBs(a.publishAt ?? a.updatedAt)}
                    </TD>
                    <TD className="text-sm">
                      {!a.notify ? (
                        <span className="text-text-muted">No</span>
                      ) : a.notifiedAt ? (
                        <Badge tone="success">Sent</Badge>
                      ) : (
                        <Badge tone="primary">When live</Badge>
                      )}
                    </TD>
                    <TD>
                      <StatusBadge status={a.status} publishAt={a.publishAt} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {cursors.length || list.data.nextCursor ? (
              <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!cursors.length}
                  onClick={() => setCursors((c) => c.slice(0, -1))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!list.data.nextCursor}
                  onClick={() => setCursors((c) => [...c, list.data.nextCursor!])}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
      {categories ? <CategoriesDialog onClose={() => setCategories(false)} /> : null}
    </>
  );
}

const EMPTY = {
  id: null as string | null,
  kind: 'current_affairs' as ArticleKindName,
  nameEn: '',
  nameNe: '',
  sortOrder: 0,
  active: true,
};

/** Categories per kind (e.g. current affairs: national, international, economy). Hidden ones keep their articles. */
function CategoriesDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['article-categories'],
    queryFn: ({ signal }) => api.get<CategoryRow[]>('/admin/article-categories', undefined, signal),
  });
  const [v, setV] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const name = toLocalized(v.nameEn, v.nameNe);
    if (!name) return setError('Enter the name in English, Nepali or both');
    setSaving(true);
    setError(null);
    try {
      const body = { kind: v.kind, name, sortOrder: v.sortOrder, active: v.active };
      if (v.id) await api.put(`/admin/article-categories/${v.id}`, body);
      else await api.post('/admin/article-categories', body);
      await qc.invalidateQueries({ queryKey: ['article-categories'] });
      toast.success(v.id ? 'Category saved' : 'Category added');
      setV({ ...EMPTY, kind: v.kind });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Article categories" size="lg">
      <div className="flex flex-col gap-5">
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.length === 0 ? (
          <p className="text-sm text-text-muted">No categories yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-sm border border-border">
            {list.data.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{localized(c.name)}</span>
                  <span className="ml-2 text-text-muted">
                    {ARTICLE_KIND[c.kind]} · {c.articles} article{c.articles === 1 ? '' : 's'}
                    {c.active ? '' : ' · hidden'}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setV({
                      id: c.id,
                      kind: c.kind,
                      nameEn: c.name.en ?? '',
                      nameNe: c.name.ne ?? '',
                      sortOrder: c.sortOrder,
                      active: c.active,
                    })
                  }
                >
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-4 rounded-sm border border-border p-4">
          <p className="text-sm font-semibold">{v.id ? 'Edit category' : 'Add a category'}</p>
          {error ? <Alert tone="danger" title={error} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kind">
              {(a) => (
                <Select
                  {...a}
                  value={v.kind}
                  onChange={(e) => setV({ ...v, kind: e.target.value as ArticleKindName })}
                >
                  {(Object.keys(ARTICLE_KIND) as ArticleKindName[]).map((k) => (
                    <option key={k} value={k}>
                      {ARTICLE_KIND[k]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Order">
              {(a) => (
                <Input
                  {...a}
                  type="number"
                  min={0}
                  value={v.sortOrder}
                  onChange={(e) => setV({ ...v, sortOrder: Number(e.target.value) || 0 })}
                />
              )}
            </Field>
            <Field label="Name (English)">
              {(a) => (
                <Input {...a} value={v.nameEn} onChange={(e) => setV({ ...v, nameEn: e.target.value })} />
              )}
            </Field>
            <Field label="नाम (नेपाली)">
              {(a) => (
                <Input
                  {...a}
                  lang="ne"
                  value={v.nameNe}
                  onChange={(e) => setV({ ...v, nameNe: e.target.value })}
                />
              )}
            </Field>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm">Shown to readers</span>
            <Switch
              checked={v.active}
              onCheckedChange={(x) => setV({ ...v, active: x })}
              label="Shown to readers"
            />
          </div>
          <div className="flex justify-end gap-2">
            {v.id ? (
              <Button variant="secondary" onClick={() => setV(EMPTY)}>
                Cancel
              </Button>
            ) : null}
            <Button onClick={() => void save()} loading={saving}>
              {v.id ? 'Save category' : 'Add category'}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
