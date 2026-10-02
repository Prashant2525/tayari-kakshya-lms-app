import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, ImagePlus, Search, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { formatBytes, imageVariant, type CursorPage, type MediaView } from '@/lib/content';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Input } from '../ui/form';
import { EmptyState, ErrorState, Spinner } from '../ui/primitives';

type Kind = 'image' | 'pdf';

export const ACCEPT: Record<Kind, string> = {
  image: 'image/jpeg,image/png,image/webp,image/gif,image/avif',
  pdf: 'application/pdf',
};

/** Uploads one file to the media library. PDFs are always stored privately by the server. */
export async function uploadMedia(file: File, visibility: 'public' | 'private'): Promise<MediaView> {
  const form = new FormData();
  form.append('visibility', visibility);
  form.append('file', file, file.name);
  return api.upload<MediaView>('/admin/media', form);
}

export function useMediaList(kind: Kind | undefined, q: string) {
  return useInfiniteQuery({
    queryKey: ['media', { kind, q }],
    queryFn: ({ pageParam }) =>
      api.get<CursorPage<MediaView>>('/admin/media', { kind, q, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function MediaThumb({ media, className }: { media: MediaView; className?: string }) {
  if (media.kind === 'pdf') {
    return (
      <div className={cn('grid place-items-center bg-danger-soft text-danger', className)}>
        <FileText className="size-8" aria-hidden />
      </div>
    );
  }
  return (
    <img
      src={imageVariant(media, 320)}
      alt={media.altText?.en ?? media.altText?.ne ?? ''}
      loading="lazy"
      className={cn('bg-surface-muted object-cover', className)}
    />
  );
}

/** Dialog for choosing (or uploading) a media-library file. */
export function MediaPickerDialog({
  kind,
  title,
  onSelect,
  onClose,
}: {
  kind: Kind;
  title?: string;
  onSelect: (media: MediaView) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const list = useMediaList(kind, q);
  // Only public images can be shown to students (icons, thumbnails, note images); PDFs are private.
  const items = (list.data?.pages.flatMap((p) => p.data) ?? []).filter(
    (m) => kind === 'pdf' || m.visibility === 'public',
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const media = await uploadMedia(file, kind === 'image' ? 'public' : 'private');
      await qc.invalidateQueries({ queryKey: ['media'] });
      toast.success('File uploaded');
      onSelect(media);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={title ?? (kind === 'image' ? 'Choose an image' : 'Choose a PDF')}
      description={
        kind === 'image'
          ? 'Pick a public image from the media library or upload a new one.'
          : 'PDFs are stored privately and shown to students only through the watermarked viewer.'
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
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
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT[kind]}
          className="sr-only"
          aria-label="Upload a file"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <Button variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}>
          <Upload /> Upload
        </Button>
      </div>
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={q ? 'No matching files' : 'No files yet'}
          description="Upload a file to use it here."
        />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onSelect(m)}
                  className="group block w-full overflow-hidden rounded-sm border border-border text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <MediaThumb media={m} className="aspect-video w-full" />
                  <span className="block truncate px-2 py-1.5 text-xs text-text-secondary">
                    {m.originalName} · {formatBytes(m.sizeBytes)}
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
        </>
      )}
    </Dialog>
  );
}

/** Form control holding a media id, with a preview and choose/remove buttons. */
export function MediaField({
  kind,
  value,
  onChange,
  label,
}: {
  kind: Kind;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const media = useQuery({
    queryKey: ['media', value],
    queryFn: () => api.get<MediaView>(`/admin/media/${value}`),
    enabled: Boolean(value),
  });
  return (
    <div className="flex items-center gap-3 rounded-sm border border-border p-3">
      {value && media.data ? (
        <MediaThumb media={media.data} className="size-16 shrink-0 rounded-sm" />
      ) : (
        <div className="grid size-16 shrink-0 place-items-center rounded-sm bg-surface-muted text-text-muted">
          {kind === 'image' ? <ImagePlus className="size-6" aria-hidden /> : <FileText className="size-6" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">{label}</p>
        <p className="truncate text-xs text-text-muted">
          {value ? (media.data?.originalName ?? 'Loading…') : 'Nothing selected'}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {value ? 'Change' : 'Choose'}
      </Button>
      {value ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remove ${label.toLowerCase()}`}
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      ) : null}
      {open ? (
        <MediaPickerDialog
          kind={kind}
          onClose={() => setOpen(false)}
          onSelect={(m) => {
            qc.setQueryData(['media', m.id], m);
            onChange(m.id);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
