import type { LocalizedText, QuestionType } from '@tk/contracts';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import type { CursorPage } from '@/lib/content';
import { formatDateTimeBs, formatRelative, localized } from '@/lib/format';
import { QUESTION_TYPE_LABEL } from '@/lib/questions';
import { cn } from '@/lib/utils';

type Status = 'open' | 'resolved' | 'rejected';
interface Report {
  id: string;
  reason: 'wrong_answer' | 'typo' | 'unclear' | 'outdated' | 'other';
  message: string | null;
  status: Status;
  createdAt: string;
  reporter: string;
  question: { id: string; type: QuestionType; preview: string; subject: LocalizedText };
  resolvedBy: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
}

const REASON: Record<Report['reason'], string> = {
  wrong_answer: 'Wrong answer',
  typo: 'Typo',
  unclear: 'Unclear',
  outdated: 'Outdated',
  other: 'Other',
};

function CloseDialog({
  report,
  to,
  onClose,
}: {
  report: Report;
  to: 'resolved' | 'rejected';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/admin/question-reports/${report.id}`, { status: to, note: note.trim() || null });
      await qc.invalidateQueries({ queryKey: ['question-reports'] });
      await qc.invalidateQueries({ queryKey: ['questions'] });
      toast.success(to === 'resolved' ? 'Report resolved' : 'Report rejected');
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
      title={to === 'resolved' ? 'Resolve report' : 'Reject report'}
      description={
        to === 'resolved'
          ? 'Fix the question first, then note what changed.'
          : 'Explain why no change is needed.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={to === 'resolved' ? 'primary' : 'danger'}
            onClick={() => void submit()}
            loading={saving}
          >
            {to === 'resolved' ? 'Resolve' : 'Reject'}
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-3">
          <Alert tone="danger" title={error} />
        </div>
      ) : null}
      <Field label="Note">
        {(a) => <Textarea {...a} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
    </Dialog>
  );
}

export function QuestionReportsPage() {
  const [status, setStatus] = useState<Status>('open');
  const [closing, setClosing] = useState<{ report: Report; to: 'resolved' | 'rejected' } | null>(null);
  const list = useInfiniteQuery({
    queryKey: ['question-reports', status],
    queryFn: ({ pageParam }) =>
      api.get<CursorPage<Report>>('/admin/question-reports', { status, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <PageHeader
        title="Question reports"
        description="Problems students found in questions. Fix the question, then resolve the report."
      />
      <div className="mb-4 flex gap-1 border-b border-border" role="tablist" aria-label="Report status">
        {(['open', 'resolved', 'rejected'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-semibold capitalize',
              status === s
                ? 'border-primary text-text'
                : 'border-transparent text-text-muted hover:text-text',
            )}
          >
            {s}
          </button>
        ))}
      </div>
      <Card>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title={status === 'open' ? 'No open reports' : `No ${status} reports`} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge tone="danger">{REASON[r.reason]}</Badge>
                    <span className="text-xs text-text-muted">
                      {r.reporter} · {formatRelative(r.createdAt)} · {QUESTION_TYPE_LABEL[r.question.type]} ·{' '}
                      {localized(r.question.subject)}
                    </span>
                  </div>
                  <Link
                    to="/questions/$questionId"
                    params={{ questionId: r.question.id }}
                    className="line-clamp-2 font-medium text-text hover:text-link"
                  >
                    {r.question.preview || 'Open question'}
                  </Link>
                  {r.message ? <p className="mt-1 text-sm text-text-secondary">“{r.message}”</p> : null}
                  {r.status !== 'open' ? (
                    <p className="mt-1 text-xs text-text-muted">
                      {r.status === 'resolved' ? 'Resolved' : 'Rejected'} by {r.resolvedBy ?? '—'} on{' '}
                      {formatDateTimeBs(r.resolvedAt)}
                      {r.resolutionNote ? ` · ${r.resolutionNote}` : ''}
                    </p>
                  ) : null}
                </div>
                {r.status === 'open' ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setClosing({ report: r, to: 'resolved' })}>
                      Resolve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setClosing({ report: r, to: 'rejected' })}
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
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
      {closing ? (
        <CloseDialog report={closing.report} to={closing.to} onClose={() => setClosing(null)} />
      ) : null}
    </>
  );
}
