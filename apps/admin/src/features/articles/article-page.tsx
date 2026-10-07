import type { LocalizedText, PublishStatus } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { MediaField } from '@/components/content/media-picker';
import { RichTextEditor } from '@/components/content/rich-text-editor';
import { StatusBadge } from '@/components/content/status';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Card, CardHeader, ErrorState, Spinner, Switch } from '@/components/ui/primitives';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isoToNepalLocal, nepalLocalToIso, STATUS_LABEL, toLocalized } from '@/lib/content';
import { formatDateBs, formatDateTimeBs, localized } from '@/lib/format';
import { isEmptyDoc, type JsonNode } from '@/lib/rich-doc';
import { cn } from '@/lib/utils';
import {
  ARTICLE_KIND,
  ARTICLE_PERIOD,
  type ArticleKindName,
  type ArticlePeriodName,
  type ArticleRow,
  type CategoryRow,
} from './articles-page';

type ArticleDetail = ArticleRow & {
  summary: LocalizedText | null;
  body: { en?: JsonNode; ne?: JsonNode };
  coverMediaId: string | null;
  quizAssessmentId: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
};

/** "Budget 2083: what changed?" → "budget-2083-what-changed" (the website address). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/** An article: write it (bilingual, rich text), then publish or schedule it (§12, D-036, D-063). */
export function ArticlePage() {
  const { articleId } = useParams({ from: '/app/articles/$articleId' });
  const isNew = articleId === 'new';
  const article = useQuery({
    queryKey: ['article', articleId],
    queryFn: () => api.get<ArticleDetail>(`/admin/articles/${articleId}`),
    enabled: !isNew,
  });
  if (!isNew && article.isPending) return <Spinner />;
  if (!isNew && article.isError)
    return <ErrorState error={article.error} onRetry={() => void article.refetch()} />;
  const a = isNew ? null : article.data!;
  return (
    <>
      <Link
        to="/articles"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" /> Articles
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-bold leading-8 tracking-tight text-text">
          {a ? 'Article' : 'New article'}
        </h1>
        {a ? <StatusBadge status={a.status} publishAt={a.publishAt} /> : null}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ArticleForm key={a ? a.updatedAt : 'new'} article={a} />
        {a ? <PublishingCard key={`p${a.updatedAt}`} article={a} /> : null}
      </div>
    </>
  );
}

function ArticleForm({ article: a }: { article: ArticleDetail | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const readOnly = Boolean(a?.live) && !can('articles:publish');
  const categories = useQuery({
    queryKey: ['article-categories'],
    queryFn: ({ signal }) => api.get<CategoryRow[]>('/admin/article-categories', undefined, signal),
  });
  const quizzes = useQuery({
    queryKey: ['article-quizzes'],
    queryFn: ({ signal }) =>
      api.get<Array<{ id: string; title: LocalizedText }>>('/admin/article-quizzes', undefined, signal),
  });
  const [v, setV] = useState({
    kind: a?.kind ?? ('current_affairs' as ArticleKindName),
    slug: a?.slug ?? '',
    slugTouched: Boolean(a),
    titleEn: a?.title.en ?? '',
    titleNe: a?.title.ne ?? '',
    summaryEn: a?.summary?.en ?? '',
    summaryNe: a?.summary?.ne ?? '',
    bodyEn: a?.body.en ?? null,
    bodyNe: a?.body.ne ?? null,
    coverMediaId: a?.coverMediaId ?? null,
    categoryId: a?.category?.id ?? '',
    period: a?.period ?? ('daily' as ArticlePeriodName),
    periodDate: a?.periodDate ?? '',
    sourceName: a?.sourceName ?? '',
    sourceUrl: a?.sourceUrl ?? '',
    quizAssessmentId: a?.quizAssessmentId ?? '',
    isFeatured: a?.isFeatured ?? false,
    notify: a?.notify ?? false,
  });
  const [lang, setLang] = useState<'en' | 'ne'>('en');
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((x) => ({ ...x, [k]: value }));
  const isCa = v.kind === 'current_affairs';
  const isGp = v.kind === 'gorkhapatra';
  const kindCategories = (categories.data ?? []).filter(
    (c) => c.kind === v.kind && (c.active || c.id === v.categoryId),
  );

  const submit = async () => {
    const title = toLocalized(v.titleEn, v.titleNe);
    if (!title) return setError('Enter the title in English, Nepali or both');
    if (isEmptyDoc(v.bodyEn) && isEmptyDoc(v.bodyNe)) return setError('Write the article');
    const payload = {
      kind: v.kind,
      slug: v.slug.trim(),
      title,
      summary: toLocalized(v.summaryEn, v.summaryNe),
      body: {
        ...(isEmptyDoc(v.bodyEn) ? {} : { en: v.bodyEn }),
        ...(isEmptyDoc(v.bodyNe) ? {} : { ne: v.bodyNe }),
      },
      coverMediaId: v.coverMediaId,
      categoryId: v.categoryId || null,
      period: isCa ? v.period : null,
      periodDate: v.periodDate || null,
      sourceName: v.sourceName.trim() || null,
      sourceUrl: v.sourceUrl.trim() || null,
      quizAssessmentId: v.quizAssessmentId || null,
      isFeatured: v.isFeatured,
      notify: v.notify,
    };
    setSaving(true);
    setError(null);
    setProblems({});
    try {
      if (a) {
        await api.put(`/admin/articles/${a.id}`, payload);
        await qc.invalidateQueries({ queryKey: ['article', a.id] });
        toast.success('Article saved');
      } else {
        const created = await api.post<{ id: string }>('/admin/articles', payload);
        toast.success('Article created');
        void navigate({ to: '/articles/$articleId', params: { articleId: created.id } });
      }
      await qc.invalidateQueries({ queryKey: ['articles'] });
    } catch (err) {
      setProblems(fieldErrors(err));
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="min-w-0">
      <CardHeader
        title="Article"
        description="Free for everyone: shown in the app and on the website once published."
      />
      <div className="flex flex-col gap-5 p-5">
        {error ? <Alert tone="danger" title={error} /> : null}
        {readOnly ? (
          <Alert tone="warning" title="This article is live: only someone who can publish may change it." />
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind">
            {(f) => (
              <Select
                {...f}
                value={v.kind}
                disabled={readOnly}
                onChange={(e) =>
                  setV((x) => ({ ...x, kind: e.target.value as ArticleKindName, categoryId: '' }))
                }
              >
                {(Object.keys(ARTICLE_KIND) as ArticleKindName[]).map((k) => (
                  <option key={k} value={k}>
                    {ARTICLE_KIND[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Category"
            hint={kindCategories.length ? undefined : 'Add categories from Articles → Categories'}
          >
            {(f) => (
              <Select
                {...f}
                value={v.categoryId}
                disabled={readOnly}
                onChange={(e) => set('categoryId', e.target.value)}
                aria-invalid={problems['categoryId'] ? true : undefined}
              >
                <option value="">No category</option>
                {kindCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {localized(c.name)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title (English)" error={problems['title']}>
            {(f) => (
              <Input
                {...f}
                maxLength={200}
                value={v.titleEn}
                disabled={readOnly}
                onChange={(e) =>
                  setV((x) => ({
                    ...x,
                    titleEn: e.target.value,
                    ...(x.slugTouched ? {} : { slug: slugify(e.target.value) }),
                  }))
                }
              />
            )}
          </Field>
          <Field label="शीर्षक (नेपाली)">
            {(f) => (
              <Input
                {...f}
                lang="ne"
                maxLength={200}
                value={v.titleNe}
                disabled={readOnly}
                onChange={(e) => set('titleNe', e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field
          label="Web address"
          hint={`On the website: /articles/${v.slug || '…'} — lowercase letters, numbers and hyphens`}
          error={problems['slug']}
        >
          {(f) => (
            <Input
              {...f}
              maxLength={80}
              value={v.slug}
              disabled={readOnly}
              onChange={(e) => setV((x) => ({ ...x, slug: e.target.value, slugTouched: true }))}
            />
          )}
        </Field>
        {isCa || isGp ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {isCa ? (
              <Field label="Period" error={problems['period']}>
                {(f) => (
                  <Select
                    {...f}
                    value={v.period}
                    disabled={readOnly}
                    onChange={(e) => set('period', e.target.value as ArticlePeriodName)}
                  >
                    {(Object.keys(ARTICLE_PERIOD) as ArticlePeriodName[]).map((p) => (
                      <option key={p} value={p}>
                        {ARTICLE_PERIOD[p]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : null}
            <Field
              label={isCa ? 'Date it covers (start of the week / month / year)' : 'Issue date'}
              hint={v.periodDate ? formatDateBs(v.periodDate) : undefined}
              error={problems['periodDate']}
            >
              {(f) => (
                <Input
                  {...f}
                  type="date"
                  value={v.periodDate}
                  disabled={readOnly}
                  onChange={(e) => set('periodDate', e.target.value)}
                />
              )}
            </Field>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Summary (English)" hint="For lists and Google; empty = the start of the text">
            {(f) => (
              <Textarea
                {...f}
                rows={3}
                maxLength={400}
                value={v.summaryEn}
                disabled={readOnly}
                onChange={(e) => set('summaryEn', e.target.value)}
              />
            )}
          </Field>
          <Field label="सारांश (नेपाली)">
            {(f) => (
              <Textarea
                {...f}
                lang="ne"
                rows={3}
                maxLength={400}
                value={v.summaryNe}
                disabled={readOnly}
                onChange={(e) => set('summaryNe', e.target.value)}
              />
            )}
          </Field>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-1" role="tablist" aria-label="Article language">
            <span className="mr-2 text-sm font-semibold text-text">Text</span>
            {(
              [
                ['en', 'English'],
                ['ne', 'नेपाली'],
              ] as const
            ).map(([l, label]) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={lang === l}
                onClick={() => setLang(l)}
                className={cn(
                  'rounded-sm px-3 py-1 text-sm',
                  lang === l
                    ? 'bg-primary-soft font-semibold text-on-primary-soft'
                    : 'text-text-muted hover:text-text',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div hidden={lang !== 'en'}>
            <RichTextEditor
              label="Article (English)"
              lang="en"
              value={v.bodyEn}
              onChange={(d) => set('bodyEn', d)}
            />
          </div>
          <div hidden={lang !== 'ne'}>
            <RichTextEditor
              label="लेख (नेपाली)"
              lang="ne"
              value={v.bodyNe}
              onChange={(d) => set('bodyNe', d)}
            />
          </div>
        </div>
        <MediaField
          kind="image"
          label="Cover image"
          value={v.coverMediaId}
          onChange={(id) => set('coverMediaId', id)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Source name" hint={isGp ? 'e.g. Gorkhapatra' : 'Optional'}>
            {(f) => (
              <Input
                {...f}
                maxLength={120}
                value={v.sourceName}
                disabled={readOnly}
                onChange={(e) => set('sourceName', e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Source link"
            hint={isGp ? 'Required: our summary links to the original (D-018)' : 'Optional, https://'}
            error={problems['sourceUrl']}
          >
            {(f) => (
              <Input
                {...f}
                type="url"
                maxLength={500}
                placeholder="https://"
                value={v.sourceUrl}
                disabled={readOnly}
                onChange={(e) => set('sourceUrl', e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field
          label="Practice quiz"
          hint="A published quiz on this topic; the app shows a “Take the quiz” button"
        >
          {(f) => (
            <Select
              {...f}
              value={v.quizAssessmentId}
              disabled={readOnly}
              onChange={(e) => set('quizAssessmentId', e.target.value)}
            >
              <option value="">No quiz</option>
              {v.quizAssessmentId && !quizzes.data?.some((q) => q.id === v.quizAssessmentId) ? (
                <option value={v.quizAssessmentId}>The linked quiz (not live now)</option>
              ) : null}
              {(quizzes.data ?? []).map((q) => (
                <option key={q.id} value={q.id}>
                  {localized(q.title)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex items-center justify-between gap-4 rounded-sm border border-border p-3">
          <p className="text-sm font-semibold text-text">Featured (shown first on Home and the website)</p>
          <Switch
            checked={v.isFeatured}
            disabled={readOnly}
            onCheckedChange={(x) => set('isFeatured', x)}
            label="Featured"
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-sm border border-border p-3">
          <div>
            <p className="text-sm font-semibold text-text">Send as push notification and email</p>
            <p className="text-xs text-text-muted">
              When it goes live, once. Students who turned articles off in their settings are not sent it.
              {a?.notifiedAt ? ` Sent ${formatDateTimeBs(a.notifiedAt)}.` : ''}
            </p>
          </div>
          <Switch
            checked={v.notify}
            disabled={readOnly || Boolean(a?.notifiedAt)}
            onCheckedChange={(x) => set('notify', x)}
            label="Send as push notification and email"
          />
        </div>
      </div>
      <div className="flex justify-end border-t border-border px-5 py-4">
        <Button onClick={() => void submit()} loading={saving} disabled={readOnly}>
          {a ? 'Save' : 'Create article'}
        </Button>
      </div>
    </Card>
  );
}

function PublishingCard({ article: a }: { article: ArticleDetail }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const publisher = can('articles:publish');
  const [status, setStatus] = useState<PublishStatus>(a.status);
  const [when, setWhen] = useState(isoToNepalLocal(a.publishAt));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const options: PublishStatus[] = publisher
    ? ['draft', 'in_review', 'scheduled', 'published', 'archived']
    : ['draft', 'in_review'];
  const apply = async () => {
    const publishAt = status === 'scheduled' ? nepalLocalToIso(when) : null;
    if (status === 'scheduled' && !publishAt) return setError('Choose the date and time to publish');
    setSaving(true);
    setError(null);
    try {
      await api.put(`/admin/articles/${a.id}/status`, { status, publishAt });
      await qc.invalidateQueries({ queryKey: ['article', a.id] });
      await qc.invalidateQueries({ queryKey: ['articles'] });
      toast.success(`Status: ${STATUS_LABEL[status]}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <CardHeader
        title="Publishing"
        description={<StatusBadge status={a.status} publishAt={a.publishAt} />}
      />
      <div className="flex flex-col gap-4 p-5">
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field label="Article status">
          {(f) => (
            <Select {...f} value={status} onChange={(e) => setStatus(e.target.value as PublishStatus)}>
              {options.map((o) => (
                <option key={o} value={o}>
                  {STATUS_LABEL[o]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {status === 'scheduled' ? (
          <Field
            label="Publish at (Nepal time)"
            hint={when ? formatDateTimeBs(nepalLocalToIso(when)) : undefined}
          >
            {(f) => (
              <Input {...f} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            )}
          </Field>
        ) : null}
        <Button
          onClick={() => void apply()}
          loading={saving}
          disabled={status === a.status && status !== 'scheduled'}
        >
          Update status
        </Button>
        {!publisher ? (
          <p className="text-xs text-text-muted">Publishing needs the "Publish articles" permission.</p>
        ) : null}
        <Button variant="secondary" onClick={() => setDeleting(true)}>
          Delete article
        </Button>
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this article?"
        description="It disappears from the app and the website. Notifications already sent are not taken back."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={async () => {
          await api.delete(`/admin/articles/${a.id}`);
          await qc.invalidateQueries({ queryKey: ['articles'] });
          toast.success('Article deleted');
          void navigate({ to: '/articles' });
        }}
      />
    </Card>
  );
}
