import type { LocalizedText, ReviewStatus } from '@tk/contracts';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import type { CursorPage } from '@/lib/content';
import { formatDateTimeBs, formatRelative, localized } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Review {
  id: string;
  rating: number;
  body: string | null;
  status: ReviewStatus;
  rejectionReason: string | null;
  course: { id: string; title: LocalizedText; slug: string };
  student: { id: string; fullName: string; email: string | null };
  moderatedBy: string | null;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const TABS: Array<{ value: ReviewStatus; label: string }> = [
  { value: 'pending', label: 'Waiting' },
  { value: 'approved', label: 'Published' },
  { value: 'rejected', label: 'Rejected' },
];

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn('size-4', n <= rating ? 'fill-warning text-warning' : 'text-text-muted')}
          aria-hidden
        />
      ))}
    </span>
  );
}

function RejectDialog({ review, onClose }: { review: Review; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/admin/reviews/${review.id}/reject`, { reason: reason.trim() });
      await qc.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('Review rejected');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Reject review"
      description="The student sees this reason with their review. It is never shown publicly."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={saving}>
            Reject
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-3">
          <Alert tone="danger" title={error} />
        </div>
      ) : null}
      <Field label="Reason" hint="At least 3 characters, e.g. “Advertising is not allowed”.">
        {(a) => <Textarea {...a} value={reason} onChange={(e) => setReason(e.target.value)} />}
      </Field>
    </Dialog>
  );
}

/** Course reviews (D-066): staff approve each one before it appears in the app and on the website. */
export function ReviewsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<ReviewStatus>('pending');
  const [rejecting, setRejecting] = useState<Review | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const list = useInfiniteQuery({
    queryKey: ['reviews', status],
    queryFn: ({ pageParam }) =>
      api.get<CursorPage<Review>>('/admin/reviews', { status, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const approve = async (r: Review) => {
    setApproving(r.id);
    try {
      await api.post(`/admin/reviews/${r.id}/approve`);
      await qc.invalidateQueries({ queryKey: ['reviews'] });
      toast.success('Review published');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setApproving(null);
    }
  };
  return (
    <>
      <PageHeader
        title="Course reviews"
        description="Students who have finished part of a course can review it. Publish a review to show it in the app and on the website; a changed review comes back here."
      />
      <div className="mb-4 flex gap-1 border-b border-border" role="tablist" aria-label="Review status">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={status === tab.value}
            onClick={() => setStatus(tab.value)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-semibold',
              status === tab.value
                ? 'border-primary text-text'
                : 'border-transparent text-text-muted hover:text-text',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <Card>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title={status === 'pending' ? 'No reviews waiting' : 'No reviews here'} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Stars rating={r.rating} />
                    <span className="font-medium">{localized(r.course.title)}</span>
                    {r.status === 'approved' ? <Badge tone="success">Published</Badge> : null}
                    {r.status === 'rejected' ? <Badge tone="danger">Rejected</Badge> : null}
                  </div>
                  <p className="text-xs text-text-muted">
                    {r.student.fullName}
                    {r.student.email ? ` · ${r.student.email}` : ''} · {formatRelative(r.updatedAt)}
                  </p>
                  {r.body ? (
                    <p className="mt-1 whitespace-pre-line text-sm text-text-secondary">“{r.body}”</p>
                  ) : (
                    <p className="mt-1 text-sm text-text-muted">Stars only, no text.</p>
                  )}
                  {r.status !== 'pending' ? (
                    <p className="mt-1 text-xs text-text-muted">
                      {r.status === 'approved' ? 'Published' : 'Rejected'} by {r.moderatedBy ?? '—'} on{' '}
                      {formatDateTimeBs(r.moderatedAt)}
                      {r.rejectionReason ? ` · ${r.rejectionReason}` : ''}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  {r.status !== 'approved' ? (
                    <Button size="sm" loading={approving === r.id} onClick={() => void approve(r)}>
                      Publish
                    </Button>
                  ) : null}
                  {r.status !== 'rejected' ? (
                    <Button size="sm" variant="secondary" onClick={() => setRejecting(r)}>
                      Reject
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
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
      {rejecting ? <RejectDialog review={rejecting} onClose={() => setRejecting(null)} /> : null}
    </>
  );
}
