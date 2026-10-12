import type { PublishStatus } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, FileText, Paperclip, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { MediaPickerDialog } from '@/components/content/media-picker';
import { RichTextEditor } from '@/components/content/rich-text-editor';
import { StatusBadge } from '@/components/content/status';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Card, CardHeader, ErrorState, Spinner, Switch } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatBytes, isoToNepalLocal, nepalLocalToIso, STATUS_LABEL, toLocalized } from '@/lib/content';
import { formatDateTimeBs } from '@/lib/format';
import { isEmptyDoc, type JsonNode } from '@/lib/rich-doc';
import { cn } from '@/lib/utils';
import { NOTICE_KIND, type NoticeKindName, type NoticeRow } from './notices-page';

type NoticeDetail = NoticeRow & {
  body: { en?: JsonNode; ne?: JsonNode };
  attachments: Array<{ id: string; name: string; sizeBytes: number }>;
};

/** A notice: write it (bilingual, rich text), then publish or schedule it (D-019, D-036, D-060). */
export function NoticePage() {
  const { noticeId } = useParams({ from: '/app/notices/$noticeId' });
  const isNew = noticeId === 'new';
  const notice = useQuery({
    queryKey: ['notice', noticeId],
    queryFn: () => api.get<NoticeDetail>(`/admin/notices/${noticeId}`),
    enabled: !isNew,
  });
  if (!isNew && notice.isPending) return <Spinner />;
  if (!isNew && notice.isError)
    return <ErrorState error={notice.error} onRetry={() => void notice.refetch()} />;
  const n = isNew ? null : notice.data!;
  return (
    <>
      <Link
        to="/notices"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" /> Notices
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-bold leading-8 tracking-tight text-text">
          {n ? 'Notice' : 'New notice'}
        </h1>
        {n ? <StatusBadge status={n.status} publishAt={n.publishAt} /> : null}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <NoticeForm key={n ? n.updatedAt : 'new'} notice={n} />
        {n ? <PublishingCard key={`p${n.updatedAt}`} notice={n} /> : null}
      </div>
    </>
  );
}

function NoticeForm({ notice: n }: { notice: NoticeDetail | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const readOnly = Boolean(n?.live) && !can('notices:publish');
  const [v, setV] = useState({
    kind: n?.kind ?? ('official' as NoticeKindName),
    titleEn: n?.title.en ?? '',
    titleNe: n?.title.ne ?? '',
    bodyEn: n?.body.en ?? null,
    bodyNe: n?.body.ne ?? null,
    isPinned: n?.isPinned ?? false,
    expiresAt: isoToNepalLocal(n?.expiresAt ?? null),
    notify: n?.notify ?? false,
    attachments: n?.attachments ?? [],
  });
  const [picking, setPicking] = useState(false);
  const [lang, setLang] = useState<'en' | 'ne'>('en');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((x) => ({ ...x, [k]: value }));

  const submit = async () => {
    const title = toLocalized(v.titleEn, v.titleNe);
    if (!title) return setError('Enter the title in English, Nepali or both');
    if (isEmptyDoc(v.bodyEn) && isEmptyDoc(v.bodyNe)) return setError('Write the notice');
    const body = {
      ...(isEmptyDoc(v.bodyEn) ? {} : { en: v.bodyEn }),
      ...(isEmptyDoc(v.bodyNe) ? {} : { ne: v.bodyNe }),
    };
    const payload = {
      kind: v.kind,
      title,
      body,
      isPinned: v.isPinned,
      expiresAt: v.expiresAt ? nepalLocalToIso(v.expiresAt) : null,
      notify: v.notify,
      attachmentMediaIds: v.attachments.map((a) => a.id),
    };
    setSaving(true);
    setError(null);
    try {
      if (n) {
        await api.put(`/admin/notices/${n.id}`, payload);
        await qc.invalidateQueries({ queryKey: ['notice', n.id] });
        toast.success('Notice saved');
      } else {
        const created = await api.post<{ id: string }>('/admin/notices', payload);
        toast.success('Notice created');
        void navigate({ to: '/notices/$noticeId', params: { noticeId: created.id } });
      }
      await qc.invalidateQueries({ queryKey: ['notices'] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="min-w-0">
      <CardHeader
        title="Notice"
        description="Shown in the app's Notice tab, newest first; pinned notices stay at the top."
      />
      <div className="flex flex-col gap-5 p-5">
        {error ? <Alert tone="danger" title={error} /> : null}
        {readOnly ? (
          <Alert tone="warning" title="This notice is live: only someone who can publish may change it." />
        ) : null}
        <Field label="Kind">
          {(a) => (
            <Select
              {...a}
              value={v.kind}
              disabled={readOnly}
              onChange={(e) => set('kind', e.target.value as NoticeKindName)}
            >
              {(Object.keys(NOTICE_KIND) as NoticeKindName[]).map((k) => (
                <option key={k} value={k}>
                  {NOTICE_KIND[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title (English)">
            {(a) => (
              <Input
                {...a}
                value={v.titleEn}
                disabled={readOnly}
                onChange={(e) => set('titleEn', e.target.value)}
              />
            )}
          </Field>
          <Field label="शीर्षक (नेपाली)">
            {(a) => (
              <Input
                {...a}
                lang="ne"
                value={v.titleNe}
                disabled={readOnly}
                onChange={(e) => set('titleNe', e.target.value)}
              />
            )}
          </Field>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-1" role="tablist" aria-label="Notice language">
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
              label="Notice (English)"
              lang="en"
              value={v.bodyEn}
              onChange={(d) => set('bodyEn', d)}
            />
          </div>
          <div hidden={lang !== 'ne'}>
            <RichTextEditor
              label="सूचना (नेपाली)"
              lang="ne"
              value={v.bodyNe}
              onChange={(d) => set('bodyNe', d)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-text">Attached PDFs</p>
          <p className="text-xs text-text-muted">
            E.g. the official notice. Students open them in the app; up to 10, from the media library.
          </p>
          {v.attachments.length ? (
            <ul className="flex flex-col gap-1">
              {v.attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="size-4 shrink-0 text-text-muted" aria-hidden />
                    <span className="truncate">{a.name}</span>
                    <span className="shrink-0 text-xs text-text-muted">{formatBytes(a.sizeBytes)}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={readOnly}
                    aria-label={`Remove ${a.name}`}
                    onClick={() =>
                      set(
                        'attachments',
                        v.attachments.filter((x) => x.id !== a.id),
                      )
                    }
                  >
                    <Trash2 /> Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <div>
            <Button
              variant="secondary"
              size="sm"
              disabled={readOnly || v.attachments.length >= 10}
              onClick={() => setPicking(true)}
            >
              <Paperclip /> Attach a PDF
            </Button>
          </div>
          {picking ? (
            <MediaPickerDialog
              kind="pdf"
              title="Attach a PDF"
              onClose={() => setPicking(false)}
              onSelect={(m) => {
                if (!v.attachments.some((a) => a.id === m.id)) {
                  set('attachments', [
                    ...v.attachments,
                    { id: m.id, name: m.originalName, sizeBytes: m.sizeBytes },
                  ]);
                }
                setPicking(false);
              }}
            />
          ) : null}
        </div>
        <Field
          label="Remove from the Notice tab after (Nepal time)"
          hint={v.expiresAt ? formatDateTimeBs(nepalLocalToIso(v.expiresAt)) : 'Empty = it stays'}
        >
          {(a) => (
            <Input
              {...a}
              type="datetime-local"
              className="w-64"
              value={v.expiresAt}
              disabled={readOnly}
              onChange={(e) => set('expiresAt', e.target.value)}
            />
          )}
        </Field>
        <div className="flex items-center justify-between gap-4 rounded-sm border border-border p-3">
          <div>
            <p className="text-sm font-semibold text-text">Pin to the top</p>
          </div>
          <Switch
            checked={v.isPinned}
            disabled={readOnly}
            onCheckedChange={(x) => set('isPinned', x)}
            label="Pin to the top"
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-sm border border-border p-3">
          <div>
            <p className="text-sm font-semibold text-text">Send as push notification and email</p>
            <p className="text-xs text-text-muted">
              When it goes live, once. Students who turned notices off in their settings are not sent it.
              {n?.notifiedAt ? ` Sent ${formatDateTimeBs(n.notifiedAt)}.` : ''}
            </p>
          </div>
          <Switch
            checked={v.notify}
            disabled={readOnly || Boolean(n?.notifiedAt)}
            onCheckedChange={(x) => set('notify', x)}
            label="Send as push notification and email"
          />
        </div>
      </div>
      <div className="flex justify-end border-t border-border px-5 py-4">
        <Button onClick={() => void submit()} loading={saving} disabled={readOnly}>
          {n ? 'Save' : 'Create notice'}
        </Button>
      </div>
    </Card>
  );
}

function PublishingCard({ notice: n }: { notice: NoticeDetail }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const publisher = can('notices:publish');
  const [status, setStatus] = useState<PublishStatus>(n.status);
  const [when, setWhen] = useState(isoToNepalLocal(n.publishAt));
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
      await api.put(`/admin/notices/${n.id}/status`, { status, publishAt });
      await qc.invalidateQueries({ queryKey: ['notice', n.id] });
      await qc.invalidateQueries({ queryKey: ['notices'] });
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
        description={<StatusBadge status={n.status} publishAt={n.publishAt} />}
      />
      <div className="flex flex-col gap-4 p-5">
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field label="Notice status">
          {(a) => (
            <Select {...a} value={status} onChange={(e) => setStatus(e.target.value as PublishStatus)}>
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
            {(a) => (
              <Input {...a} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            )}
          </Field>
        ) : null}
        <Button
          onClick={() => void apply()}
          loading={saving}
          disabled={status === n.status && status !== 'scheduled'}
        >
          Update status
        </Button>
        {!publisher ? (
          <p className="text-xs text-text-muted">Publishing needs the "Publish notices" permission.</p>
        ) : null}
        <Button variant="secondary" onClick={() => setDeleting(true)}>
          Delete notice
        </Button>
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this notice?"
        description="It disappears from the app. Notifications already sent are not taken back."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={async () => {
          await api.delete(`/admin/notices/${n.id}`);
          await qc.invalidateQueries({ queryKey: ['notices'] });
          toast.success('Notice deleted');
          void navigate({ to: '/notices' });
        }}
      />
    </Card>
  );
}
