import { useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, Lock, Search, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ACCEPT, MediaThumb, uploadMedia, useMediaList } from '@/components/content/media-picker';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatBytes, toLocalized, type MediaView } from '@/lib/content';
import { formatDateTimeBs } from '@/lib/format';

function DetailDialog({ media, onClose }: { media: MediaView; onClose: () => void }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const manage = can('media:manage');
  const [altEn, setAltEn] = useState(media.altText?.en ?? '');
  const [altNe, setAltNe] = useState(media.altText?.ne ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/admin/media/${media.id}`, { altText: toLocalized(altEn, altNe) });
      await qc.invalidateQueries({ queryKey: ['media'] });
      toast.success('Description saved');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog
        open
        size="lg"
        onOpenChange={(o) => !o && onClose()}
        title={media.originalName}
        footer={
          manage ? (
            <>
              <Button variant="ghost" className="mr-auto text-danger" onClick={() => setDeleting(true)}>
                <Trash2 /> Delete
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              {media.kind === 'image' ? (
                <Button onClick={() => void save()} loading={saving}>
                  Save
                </Button>
              ) : null}
            </>
          ) : (
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-5">
          {error ? <Alert tone="danger" title={error} /> : null}
          {media.kind === 'image' ? (
            <img
              src={media.url}
              alt={media.altText?.en ?? ''}
              className="max-h-80 w-full rounded-sm bg-surface-muted object-contain"
            />
          ) : (
            <MediaThumb media={media} className="h-40 w-full rounded-sm" />
          )}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-text-muted">Type</dt>
              <dd className="font-medium text-text">{media.kind === 'pdf' ? 'PDF' : 'Image (WebP)'}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Size</dt>
              <dd className="font-medium text-text">{formatBytes(media.sizeBytes)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">{media.kind === 'pdf' ? 'Pages' : 'Dimensions'}</dt>
              <dd className="font-medium text-text">
                {media.kind === 'pdf' ? (media.pageCount ?? '—') : `${media.width} × ${media.height}`}
              </dd>
            </div>
            <div>
              <dt className="text-text-muted">Visibility</dt>
              <dd className="font-medium text-text">
                {media.visibility === 'public' ? 'Public' : 'Private'}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-text-muted">Uploaded</dt>
              <dd className="font-medium text-text">{formatDateTimeBs(media.createdAt)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <a href={media.url} target="_blank" rel="noreferrer">
                <ExternalLink /> Open
              </a>
            </Button>
            {media.visibility === 'public' ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(media.url)
                    .then(() => toast.success('Link copied'))
                    .catch(() => toast.error('Could not copy the link'))
                }
              >
                <Copy /> Copy link
              </Button>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-text-muted">
                <Lock className="size-3.5" aria-hidden /> Private: the link expires shortly and is for staff
                preview only.
              </p>
            )}
          </div>
          {media.kind === 'image' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Description (English)" hint="Read aloud by screen readers.">
                {(a) => (
                  <Input {...a} value={altEn} onChange={(e) => setAltEn(e.target.value)} disabled={!manage} />
                )}
              </Field>
              <Field label="विवरण (नेपाली)">
                {(a) => (
                  <Input
                    {...a}
                    lang="ne"
                    value={altNe}
                    onChange={(e) => setAltNe(e.target.value)}
                    disabled={!manage}
                  />
                )}
              </Field>
            </div>
          ) : null}
        </div>
      </Dialog>
      {deleting ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(false)}
          title="Delete this file?"
          description="Files still used by content cannot be deleted. Remove them from that content first."
          confirmLabel="Delete file"
          onConfirm={async () => {
            await api.delete(`/admin/media/${media.id}`);
            await qc.invalidateQueries({ queryKey: ['media'] });
            toast.success('File deleted');
            onClose();
          }}
        />
      ) : null}
    </>
  );
}

export function MediaPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [kind, setKind] = useState<'' | 'image' | 'pdf'>('');
  const [q, setQ] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [selected, setSelected] = useState<MediaView | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const list = useMediaList(kind || undefined, q);
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    let ok = 0;
    for (const file of Array.from(files)) {
      setUploading(file.name);
      try {
        await uploadMedia(file, file.type === 'application/pdf' ? 'private' : visibility);
        ok += 1;
      } catch (err) {
        toast.error(`${file.name}: ${errorMessage(err)}`);
      }
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = '';
    if (ok) {
      toast.success(ok === 1 ? 'File uploaded' : `${ok} files uploaded`);
      await qc.invalidateQueries({ queryKey: ['media'] });
    }
  };

  return (
    <>
      <PageHeader
        title="Media library"
        description="Images are optimised automatically. PDFs are always private and reach students only through the watermarked viewer."
        actions={
          can('media:manage') ? (
            <>
              <Select
                aria-label="Visibility of new images"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
                className="w-auto"
              >
                <option value="public">New images: public</option>
                <option value="private">New images: private</option>
              </Select>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={`${ACCEPT.image},${ACCEPT.pdf}`}
                className="sr-only"
                aria-label="Upload files"
                onChange={(e) => void onFiles(e.target.files)}
              />
              <Button onClick={() => fileRef.current?.click()} loading={uploading !== null}>
                <Upload /> {uploading ? `Uploading ${uploading}` : 'Upload'}
              </Button>
            </>
          ) : undefined
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by file name"
              className="pl-9"
              aria-label="Search files"
            />
          </div>
          <Select
            aria-label="File type"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="w-auto"
          >
            <option value="">All files</option>
            <option value="image">Images</option>
            <option value="pdf">PDFs</option>
          </Select>
        </div>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            title={q || kind ? 'No matching files' : 'The media library is empty'}
            description="Upload images (JPEG, PNG, WebP, GIF, AVIF) and PDFs to use them in content."
          />
        ) : (
          <div className="p-4">
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(m)}
                    className="block w-full overflow-hidden rounded-sm border border-border text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <MediaThumb media={m} className="aspect-video w-full" />
                    <span className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text">{m.originalName}</span>
                        <span className="block text-xs text-text-muted">{formatBytes(m.sizeBytes)}</span>
                      </span>
                      {m.visibility === 'private' ? <Badge>Private</Badge> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {list.hasNextPage ? (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={list.isFetchingNextPage}
                  onClick={() => void list.fetchNextPage()}
                >
                  Load more
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Card>
      {selected ? <DetailDialog media={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}
