import type { PublishStatus } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ArrowLeft, Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { MediaField } from '@/components/content/media-picker';
import { RichTextEditor } from '@/components/content/rich-text-editor';
import { StatusBadge } from '@/components/content/status';
import { ChecklistCard, ItemPreviewButton } from '@/components/content/qa';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Card, CardHeader, ErrorState, Spinner, Switch } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  formatDuration,
  isoToNepalLocal,
  ITEM_TYPE_LABEL,
  nepalLocalToIso,
  parseDuration,
  STATUS_LABEL,
  toLocalized,
  type ItemType,
  type LearningItemAdmin,
} from '@/lib/content';
import { formatDateTimeBs } from '@/lib/format';
import { isEmptyDoc, type JsonNode } from '@/lib/rich-doc';
import { cn } from '@/lib/utils';

interface Draft {
  titleEn: string;
  titleNe: string;
  accessLevel: 'free' | 'premium';
  language: 'en' | 'ne' | 'both';
  noteEn: JsonNode | null;
  noteNe: JsonNode | null;
  pdfMediaId: string | null;
  downloadable: boolean;
  provider: 'youtube' | 'bunny';
  youtubeUrl: string;
  bunnyVideoId: string;
  duration: string;
}

function draftFrom(item: LearningItemAdmin | null): Draft {
  const video = item?.video;
  return {
    titleEn: item?.title.en ?? '',
    titleNe: item?.title.ne ?? '',
    accessLevel: item?.accessLevel ?? 'premium',
    language: item?.language ?? 'both',
    noteEn: (item?.noteContent?.en as JsonNode | undefined) ?? null,
    noteNe: (item?.noteContent?.ne as JsonNode | undefined) ?? null,
    pdfMediaId: item?.pdf?.id ?? null,
    downloadable: item?.downloadable ?? false,
    provider: video?.provider ?? 'youtube',
    youtubeUrl: video?.provider === 'youtube' ? `https://youtu.be/${video.providerVideoId}` : '',
    bunnyVideoId: video?.provider === 'bunny' ? video.providerVideoId : '',
    duration: formatDuration(item?.durationSeconds),
  };
}

type Errors = Partial<Record<'title' | 'note' | 'pdf' | 'video' | 'duration', string>>;

function validate(type: ItemType, d: Draft): Errors {
  const e: Errors = {};
  if (!d.titleEn.trim() && !d.titleNe.trim()) e.title = 'Enter the title in English, Nepali or both';
  if (type === 'note' && isEmptyDoc(d.noteEn) && isEmptyDoc(d.noteNe))
    e.note = 'Write the note in English, Nepali or both';
  if (type === 'pdf' && !d.pdfMediaId) e.pdf = 'Choose a PDF';
  if (type === 'video') {
    if (d.provider === 'youtube' && !d.youtubeUrl.trim()) e.video = 'Paste the YouTube link';
    if (d.provider === 'bunny' && d.bunnyVideoId.trim().length < 8) e.video = 'Enter the Bunny video ID';
    const seconds = parseDuration(d.duration);
    if (seconds !== null && (Number.isNaN(seconds) || seconds < 1 || seconds > 86_400))
      e.duration = 'Use minutes:seconds, e.g. 12:30';
  }
  return e;
}

function payload(type: ItemType, d: Draft) {
  const base = {
    type,
    title: toLocalized(d.titleEn, d.titleNe),
    accessLevel: d.accessLevel,
    language: d.language,
  };
  if (type === 'note') {
    return {
      ...base,
      noteContent: {
        ...(isEmptyDoc(d.noteEn) ? {} : { en: d.noteEn }),
        ...(isEmptyDoc(d.noteNe) ? {} : { ne: d.noteNe }),
      },
    };
  }
  if (type === 'pdf') return { ...base, pdfMediaId: d.pdfMediaId, downloadable: d.downloadable };
  return {
    ...base,
    video:
      d.provider === 'youtube'
        ? { provider: 'youtube', url: d.youtubeUrl.trim() }
        : { provider: 'bunny', videoId: d.bunnyVideoId.trim() },
    durationSeconds: parseDuration(d.duration),
  };
}

function PublishingCard({ item, onChanged }: { item: LearningItemAdmin; onChanged: () => Promise<unknown> }) {
  const { can } = useAuth();
  const canPublish = can('content:publish');
  const [status, setStatus] = useState<PublishStatus>(item.status);
  const [when, setWhen] = useState(isoToNepalLocal(item.publishAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options: PublishStatus[] = canPublish
    ? ['draft', 'in_review', 'scheduled', 'published', 'archived']
    : ['draft', 'in_review'];
  const apply = async () => {
    setError(null);
    const publishAt = status === 'scheduled' ? nepalLocalToIso(when) : null;
    if (status === 'scheduled' && !publishAt) {
      setError('Choose the date and time to publish');
      return;
    }
    setBusy(true);
    try {
      await api.put(`/admin/learning-items/${item.id}/publishing`, { status, publishAt });
      await onChanged();
      toast.success(`Status: ${STATUS_LABEL[status]}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader
        title="Publishing"
        description={<StatusBadge status={item.status} publishAt={item.publishAt} />}
      />
      <div className="flex flex-col gap-4 p-5">
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field label="Status">
          {(a) => (
            <Select {...a} value={status} onChange={(e) => setStatus(e.target.value as PublishStatus)}>
              {options.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
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
        {!canPublish ? (
          <p className="text-xs text-text-muted">
            Submit for review; someone with publishing rights makes it live.
          </p>
        ) : null}
        <Button
          onClick={() => void apply()}
          loading={busy}
          disabled={status === item.status && status !== 'scheduled'}
        >
          Update status
        </Button>
      </div>
    </Card>
  );
}

function ItemEditor({
  type,
  item,
  topicId,
  subjectId,
}: {
  type: ItemType;
  item: LearningItemAdmin | null;
  topicId: string;
  subjectId?: string;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(item));
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [noteLang, setNoteLang] = useState<'en' | 'ne'>(draft.noteEn || !draft.noteNe ? 'en' : 'ne');
  const live = item ? item.status === 'published' || item.status === 'scheduled' : false;
  const locked = live && !can('content:publish');

  useBlocker({
    shouldBlockFn: () => dirty && !window.confirm('You have unsaved changes. Leave without saving?'),
    enableBeforeUnload: () => dirty,
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    const found = validate(type, draft);
    setErrors(found);
    setError(null);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const body = payload(type, draft);
      if (item) {
        const updated = await api.put<LearningItemAdmin>(`/admin/learning-items/${item.id}`, body);
        qc.setQueryData(['learning-item', item.id], updated);
        setDirty(false);
        toast.success('Saved');
      } else {
        const created = await api.post<LearningItemAdmin>(`/admin/topics/${topicId}/items`, body);
        setDirty(false);
        qc.setQueryData(['learning-item', created.id], created);
        toast.success(`${ITEM_TYPE_LABEL[type]} created as a draft`);
        // Leave the "new" page without tripping the unsaved-changes guard.
        setTimeout(() => {
          void navigate({
            to: '/learning-items/$itemId',
            params: { itemId: created.id },
            search: { subjectId },
            replace: true,
          });
        });
      }
      await qc.invalidateQueries({ queryKey: ['subject-tree'] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const backLink = subjectId ? (
    <Link
      to="/subjects/$subjectId"
      params={{ subjectId }}
      className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
    >
      <ArrowLeft className="size-4" /> Back to subject
    </Link>
  ) : (
    <Link
      to="/subjects"
      className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
    >
      <ArrowLeft className="size-4" /> Subjects
    </Link>
  );

  return (
    <>
      {backLink}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            {ITEM_TYPE_LABEL[type]}
          </p>
          <h1 className="text-[26px] font-bold leading-8 tracking-tight text-text">
            {item
              ? draft.titleEn || draft.titleNe || 'Untitled'
              : `New ${ITEM_TYPE_LABEL[type].toLowerCase()}`}
          </h1>
        </div>
        <Button onClick={() => void save()} loading={saving} disabled={locked}>
          <Save /> {item ? 'Save changes' : 'Create draft'}
        </Button>
      </div>
      {locked ? (
        <div className="mb-4">
          <Alert tone="warning" title="This is live">
            Ask someone who can publish to change it, or to move it back to draft first.
          </Alert>
        </div>
      ) : null}
      {error ? (
        <div className="mb-4">
          <Alert tone="danger" title={error} />
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Title (English)" error={errors.title}>
                {(a) => (
                  <Input {...a} value={draft.titleEn} onChange={(e) => set('titleEn', e.target.value)} />
                )}
              </Field>
              <Field label="शीर्षक (नेपाली)">
                {(a) => (
                  <Input
                    {...a}
                    lang="ne"
                    value={draft.titleNe}
                    onChange={(e) => set('titleNe', e.target.value)}
                  />
                )}
              </Field>
            </div>
          </Card>

          {type === 'note' ? (
            <Card>
              <div
                className="flex items-center gap-1 border-b border-border px-3 pt-3"
                role="tablist"
                aria-label="Note language"
              >
                {(
                  [
                    ['en', 'English'],
                    ['ne', 'नेपाली'],
                  ] as const
                ).map(([lang, label]) => (
                  <button
                    key={lang}
                    type="button"
                    role="tab"
                    aria-selected={noteLang === lang}
                    onClick={() => setNoteLang(lang)}
                    className={cn(
                      '-mb-px border-b-2 px-4 py-2 text-sm font-semibold',
                      noteLang === lang
                        ? 'border-primary text-text'
                        : 'border-transparent text-text-muted hover:text-text',
                    )}
                  >
                    {label}
                    {!isEmptyDoc(lang === 'en' ? draft.noteEn : draft.noteNe) ? (
                      <span
                        className="ml-1.5 inline-block size-1.5 rounded-full bg-success align-middle"
                        aria-label="has content"
                      />
                    ) : null}
                  </button>
                ))}
              </div>
              <div className="p-4">
                {errors.note ? (
                  <p className="mb-2 text-[13px] text-danger" role="alert">
                    {errors.note}
                  </p>
                ) : null}
                {/* Keyed so each language keeps its own editor history. */}
                <div hidden={noteLang !== 'en'}>
                  <RichTextEditor
                    label="Note (English)"
                    lang="en"
                    value={draft.noteEn}
                    invalid={Boolean(errors.note)}
                    onChange={(doc) => set('noteEn', doc)}
                  />
                </div>
                <div hidden={noteLang !== 'ne'}>
                  <RichTextEditor
                    label="नोट (नेपाली)"
                    lang="ne"
                    value={draft.noteNe}
                    invalid={Boolean(errors.note)}
                    onChange={(doc) => set('noteNe', doc)}
                  />
                </div>
              </div>
            </Card>
          ) : null}

          {type === 'pdf' ? (
            <Card>
              <CardHeader
                title="PDF file"
                description="Students read it in the app with their own watermark on every page."
              />
              <div className="flex flex-col gap-4 p-5">
                <MediaField
                  kind="pdf"
                  label="PDF"
                  value={draft.pdfMediaId}
                  onChange={(id) => set('pdfMediaId', id)}
                />
                {errors.pdf ? (
                  <p className="text-[13px] text-danger" role="alert">
                    {errors.pdf}
                  </p>
                ) : null}
                <div className="flex items-center justify-between rounded-sm border border-border p-3">
                  <div>
                    <p className="text-sm font-semibold text-text">Allow download</p>
                    <p className="text-xs text-text-muted">Downloads are watermarked too.</p>
                  </div>
                  <Switch
                    checked={draft.downloadable}
                    onCheckedChange={(v) => set('downloadable', v)}
                    label="Allow download"
                  />
                </div>
              </div>
            </Card>
          ) : null}

          {type === 'video' ? (
            <Card>
              <CardHeader title="Video" />
              <div className="flex flex-col gap-4 p-5">
                <fieldset className="flex flex-wrap gap-4">
                  <legend className="mb-2 text-sm font-semibold text-text">Where is it hosted?</legend>
                  {(
                    [
                      ['bunny', 'Bunny Stream (protected)'],
                      ['youtube', 'YouTube (unlisted)'],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 text-sm text-text">
                      <input
                        type="radio"
                        name="provider"
                        value={value}
                        checked={draft.provider === value}
                        onChange={() => set('provider', value)}
                        className="size-4 accent-[var(--tk-primary)]"
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                {draft.provider === 'youtube' ? (
                  <Field
                    label="YouTube link"
                    error={errors.video}
                    hint="Any YouTube link: watch, youtu.be, shorts or embed."
                  >
                    {(a) => (
                      <Input
                        {...a}
                        value={draft.youtubeUrl}
                        onChange={(e) => set('youtubeUrl', e.target.value)}
                        placeholder="https://youtu.be/…"
                      />
                    )}
                  </Field>
                ) : (
                  <Field
                    label="Bunny video ID"
                    error={errors.video}
                    hint="From the Bunny Stream library (the video GUID)."
                  >
                    {(a) => (
                      <Input
                        {...a}
                        value={draft.bunnyVideoId}
                        onChange={(e) => set('bunnyVideoId', e.target.value)}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      />
                    )}
                  </Field>
                )}
                {draft.provider === 'youtube' && draft.accessLevel === 'premium' ? (
                  <Alert tone="warning" title="YouTube videos are not protected">
                    Anyone with the link can watch them outside the app. Use Bunny Stream for premium videos.
                  </Alert>
                ) : null}
                <Field
                  label="Duration"
                  error={errors.duration}
                  hint="Optional, e.g. 12:30. Filled automatically when the provider reports it."
                  className="sm:max-w-60"
                >
                  {(a) => (
                    <Input {...a} value={draft.duration} onChange={(e) => set('duration', e.target.value)} />
                  )}
                </Field>
                {item?.video ? (
                  <p className="text-xs text-text-muted">
                    Linked: {item.video.provider === 'bunny' ? 'Bunny' : 'YouTube'}{' '}
                    {item.video.providerVideoId}
                    {item.video.title ? ` · “${item.video.title}”` : ''} · {item.video.status}
                  </p>
                ) : null}
              </div>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Access" />
            <div className="flex flex-col gap-4 p-5">
              <Field
                label="Who can open it"
                hint="Free items work as previews for everyone; premium needs course access."
              >
                {(a) => (
                  <Select
                    {...a}
                    value={draft.accessLevel}
                    onChange={(e) => set('accessLevel', e.target.value as Draft['accessLevel'])}
                  >
                    <option value="premium">Premium (course access)</option>
                    <option value="free">Free preview</option>
                  </Select>
                )}
              </Field>
              <Field label="Content language">
                {(a) => (
                  <Select
                    {...a}
                    value={draft.language}
                    onChange={(e) => set('language', e.target.value as Draft['language'])}
                  >
                    <option value="both">English and Nepali</option>
                    <option value="en">English</option>
                    <option value="ne">Nepali</option>
                  </Select>
                )}
              </Field>
            </div>
          </Card>
          {item ? <ItemPreviewButton item={item} /> : null}
          {item ? (
            <ChecklistCard url={`/admin/learning-items/${item.id}/checklist`} version={item.updatedAt} />
          ) : null}
          {item ? (
            <PublishingCard
              key={`${item.status}-${item.publishAt}`}
              item={item}
              onChanged={() =>
                Promise.all([
                  qc.invalidateQueries({ queryKey: ['learning-item', item.id] }),
                  qc.invalidateQueries({ queryKey: ['subject-tree'] }),
                ])
              }
            />
          ) : (
            <p className="text-sm text-text-muted">New items start as drafts. Publish after saving.</p>
          )}
        </div>
      </div>
    </>
  );
}

export function NewItemPage() {
  const { topicId } = useParams({ from: '/app/topics/$topicId/new' });
  const { type, subjectId } = useSearch({ from: '/app/topics/$topicId/new' });
  return (
    <ItemEditor key={`${topicId}-${type}`} type={type} item={null} topicId={topicId} subjectId={subjectId} />
  );
}

export function ItemPage() {
  const { itemId } = useParams({ from: '/app/learning-items/$itemId' });
  const { subjectId } = useSearch({ from: '/app/learning-items/$itemId' });
  const item = useQuery({
    queryKey: ['learning-item', itemId],
    queryFn: () => api.get<LearningItemAdmin>(`/admin/learning-items/${itemId}`),
  });
  if (item.isPending) return <Spinner />;
  if (item.isError) return <ErrorState error={item.error} onRetry={() => void item.refetch()} />;
  return (
    <ItemEditor
      key={`${item.data.id}-${item.data.updatedAt}`}
      type={item.data.type}
      item={item.data}
      topicId={item.data.topicId}
      subjectId={subjectId}
    />
  );
}
