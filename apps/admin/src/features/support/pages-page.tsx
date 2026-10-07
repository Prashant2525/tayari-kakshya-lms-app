import type { LocalizedText } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { RichTextEditor } from '@/components/content/rich-text-editor';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { Alert, Badge, Card, CardHeader, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { toLocalized } from '@/lib/content';
import { formatDateTimeBs, localized } from '@/lib/format';
import { isEmptyDoc, type JsonNode } from '@/lib/rich-doc';
import { cn } from '@/lib/utils';

type Slug = 'about' | 'terms' | 'privacy' | 'refund';

interface PageRow {
  slug: Slug;
  title: LocalizedText;
  version: number | null;
  publishedAt: string | null;
  unpublishedChanges: boolean;
  updatedAt: string;
}

interface PageDetail {
  slug: Slug;
  title: LocalizedText;
  body: { en?: JsonNode; ne?: JsonNode };
  problems: string[];
  unpublishedChanges: boolean;
  updatedAt: string;
  versions: Array<{ version: number; publishedAt: string; publishedBy: string | null }>;
}

const WHERE: Record<Slug, string> = {
  about: 'App Profile and the website footer',
  terms: 'Sign-up, app Profile and the website footer',
  privacy: 'Sign-up, app Profile and the website footer',
  refund: 'Website footer and the Android app (not the iPhone app, which sells nothing)',
};

/** About, Terms, Privacy and Refund (D-038): edited as a draft, published as numbered versions that are kept. */
export function PagesPage() {
  const list = useQuery({
    queryKey: ['pages'],
    queryFn: ({ signal }) => api.get<PageRow[]>('/admin/pages', undefined, signal),
  });
  return (
    <>
      <PageHeader
        title="Pages"
        description="The About, Terms, Privacy and Refund pages. They started as DRAFT texts written for you to review (D-038): fill in every [[…]] and remove the DRAFT line, then publish. Have the legal pages checked before launch."
      />
      <Card>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Page</TH>
                <TH>Shown in</TH>
                <TH>Published</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {list.data.map((p) => (
                <TR key={p.slug}>
                  <TD>
                    <Link to="/pages/$slug" params={{ slug: p.slug }} className="font-medium text-link">
                      {localized(p.title)}
                    </Link>
                  </TD>
                  <TD className="text-sm text-text-muted">{WHERE[p.slug]}</TD>
                  <TD className="whitespace-nowrap text-sm">
                    {p.version ? `Version ${p.version} · ${formatDateTimeBs(p.publishedAt)}` : 'Not yet'}
                  </TD>
                  <TD>
                    {!p.version ? (
                      <Badge>Draft</Badge>
                    ) : p.unpublishedChanges ? (
                      <Badge tone="primary">Changes not published</Badge>
                    ) : (
                      <Badge tone="success">Published</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}

export function PageEditor() {
  const { slug } = useParams({ from: '/app/pages/$slug' });
  const page = useQuery({
    queryKey: ['page', slug],
    queryFn: ({ signal }) => api.get<PageDetail>(`/admin/pages/${slug}`, undefined, signal),
  });
  return (
    <>
      <Link
        to="/pages"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" /> Pages
      </Link>
      {page.isPending ? (
        <Spinner />
      ) : page.isError ? (
        <ErrorState error={page.error} onRetry={() => void page.refetch()} />
      ) : (
        <PageForm key={page.data.updatedAt} page={page.data} />
      )}
    </>
  );
}

function PageForm({ page: p }: { page: PageDetail }) {
  const qc = useQueryClient();
  const [v, setV] = useState({
    titleEn: p.title.en ?? '',
    titleNe: p.title.ne ?? '',
    bodyEn: p.body.en ?? null,
    bodyNe: p.body.ne ?? null,
  });
  const [lang, setLang] = useState<'en' | 'ne'>('en');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const dirty =
    v.titleEn !== (p.title.en ?? '') ||
    v.titleNe !== (p.title.ne ?? '') ||
    JSON.stringify(v.bodyEn) !== JSON.stringify(p.body.en ?? null) ||
    JSON.stringify(v.bodyNe) !== JSON.stringify(p.body.ne ?? null);

  const save = async () => {
    const title = toLocalized(v.titleEn, v.titleNe);
    if (!title) return setError('Enter the title in English, Nepali or both');
    if (isEmptyDoc(v.bodyEn) && isEmptyDoc(v.bodyNe)) return setError('Write the page');
    setSaving(true);
    setError(null);
    try {
      await api.put(`/admin/pages/${p.slug}`, {
        title,
        body: {
          ...(isEmptyDoc(v.bodyEn) ? {} : { en: v.bodyEn }),
          ...(isEmptyDoc(v.bodyNe) ? {} : { ne: v.bodyNe }),
        },
      });
      await qc.invalidateQueries({ queryKey: ['page', p.slug] });
      await qc.invalidateQueries({ queryKey: ['pages'] });
      toast.success('Draft saved');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="min-w-0">
        <CardHeader title={localized(p.title)} description={`Shown in: ${WHERE[p.slug]}.`} />
        <div className="flex flex-col gap-5 p-5">
          {error ? <Alert tone="danger" title={error} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title (English)">
              {(a) => (
                <Input
                  {...a}
                  maxLength={120}
                  value={v.titleEn}
                  onChange={(e) => setV({ ...v, titleEn: e.target.value })}
                />
              )}
            </Field>
            <Field label="शीर्षक (नेपाली)">
              {(a) => (
                <Input
                  {...a}
                  lang="ne"
                  maxLength={120}
                  value={v.titleNe}
                  onChange={(e) => setV({ ...v, titleNe: e.target.value })}
                />
              )}
            </Field>
          </div>
          <div>
            <div className="mb-2 flex items-center gap-1" role="tablist" aria-label="Page language">
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
                label="Page (English)"
                lang="en"
                value={v.bodyEn}
                onChange={(d) => setV((x) => ({ ...x, bodyEn: d }))}
              />
            </div>
            <div hidden={lang !== 'ne'}>
              <RichTextEditor
                label="पृष्ठ (नेपाली)"
                lang="ne"
                value={v.bodyNe}
                onChange={(d) => setV((x) => ({ ...x, bodyNe: d }))}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end border-t border-border px-5 py-4">
          <Button onClick={() => void save()} loading={saving} disabled={!dirty}>
            Save draft
          </Button>
        </div>
      </Card>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Publishing" description="Readers see the last published version." />
          <div className="flex flex-col gap-4 p-5">
            {p.problems.length ? (
              <Alert tone="warning" title="Not ready to publish">
                <ul className="list-disc pl-4">
                  {p.problems.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            {dirty ? <p className="text-sm text-text-muted">Save the draft first.</p> : null}
            <Button
              onClick={() => setPublishing(true)}
              disabled={dirty || p.problems.length > 0 || !p.unpublishedChanges}
            >
              Publish
            </Button>
            {!p.unpublishedChanges && p.versions.length ? (
              <p className="text-sm text-text-muted">The published version is up to date.</p>
            ) : null}
          </div>
        </Card>
        <Card>
          <CardHeader title="Versions" description="Kept as published (a record of what readers saw)." />
          {p.versions.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-text-muted">Not published yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {p.versions.map((x) => (
                <li key={x.version} className="px-5 py-3 text-sm">
                  <span className="font-semibold">Version {x.version}</span>
                  <span className="block text-text-muted">
                    {formatDateTimeBs(x.publishedAt)}
                    {x.publishedBy ? ` · ${x.publishedBy}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <ConfirmDialog
        open={publishing}
        onOpenChange={setPublishing}
        title="Publish this page?"
        description="Readers will see it at once in the app and on the website. Published versions are kept and cannot be changed."
        confirmLabel="Publish"
        tone="primary"
        onConfirm={async () => {
          await api.post(`/admin/pages/${p.slug}/publish`);
          await qc.invalidateQueries({ queryKey: ['page', p.slug] });
          await qc.invalidateQueries({ queryKey: ['pages'] });
          toast.success('Published');
        }}
      />
    </div>
  );
}
