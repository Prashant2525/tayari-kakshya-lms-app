import type { DiscussionTarget, LocalizedText, ReportReason } from '@tk/contracts';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import type { CursorPage } from '@/lib/content';
import { formatDateTimeBs, formatRelative, localized } from '@/lib/format';
import { cn } from '@/lib/utils';

type View = 'reported' | 'recent' | 'hidden';
interface Row {
  id: string;
  target: DiscussionTarget;
  targetId: string;
  context: { title: string; subject: LocalizedText } | null;
  parentId: string | null;
  parentBody: string | null;
  body: string;
  status: 'visible' | 'hidden' | 'deleted';
  best: boolean;
  author: { id: string; name: string; email: string | null; staff: boolean; bannedUntil: string | null };
  reports: Array<{ reason: ReportReason; message: string | null }>;
  hiddenReason: string | null;
  hiddenBy: string | null;
  createdAt: string;
}
interface ThreadPost {
  id: string;
  body: string;
  author: string;
  staff: boolean;
  best: boolean;
  deleted: boolean;
  status?: 'visible' | 'hidden' | 'deleted';
  createdAt: string;
  replies?: ThreadPost[];
}

const TABS: Array<{ value: View; label: string }> = [
  { value: 'reported', label: 'Reported' },
  { value: 'recent', label: 'Recent' },
  { value: 'hidden', label: 'Hidden' },
];
const REASON: Record<ReportReason, string> = {
  spam: 'Spam',
  rude: 'Rude',
  wrong: 'Wrong',
  other: 'Other',
};
const BAN_DAYS = [
  { value: '1', label: '1 day' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: 'forever', label: 'Until allowed again' },
];

function useAct() {
  const qc = useQueryClient();
  return async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['discussions'] });
      toast.success(done);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  };
}

function HideDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const act = useAct();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Hide post"
      description="Students no longer see it (with its replies, if it is a question). Open reports on it are closed."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={saving}
            onClick={async () => {
              setSaving(true);
              const ok = await act(
                () => api.post(`/admin/discussions/posts/${row.id}/hide`, { reason: reason.trim() }),
                'Post hidden',
              );
              setSaving(false);
              if (ok) onClose();
            }}
          >
            Hide
          </Button>
        </>
      }
    >
      <Field label="Reason" hint="For staff; at least 3 characters.">
        {(a) => <Textarea {...a} value={reason} onChange={(e) => setReason(e.target.value)} />}
      </Field>
    </Dialog>
  );
}

function BanDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const act = useAct();
  const [days, setDays] = useState('7');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Stop posting"
      description={`${row.author.name} can still read discussions but cannot post or reply.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={saving}
            onClick={async () => {
              setSaving(true);
              const until =
                days === 'forever' ? null : new Date(Date.now() + Number(days) * 86_400_000).toISOString();
              const ok = await act(
                () => api.put(`/admin/discussions/bans/${row.author.id}`, { until, reason: reason.trim() }),
                'Posting stopped',
              );
              setSaving(false);
              if (ok) onClose();
            }}
          >
            Stop posting
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="For how long">
          {(a) => (
            <Select {...a} value={days} onChange={(e) => setDays(e.target.value)}>
              {BAN_DAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Reason" hint="For staff; at least 3 characters.">
          {(a) => <Textarea {...a} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}

/** The whole thread (hidden posts marked), where a teacher can post or reply. */
function ThreadDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const act = useAct();
  const qc = useQueryClient();
  const thread = useQuery({
    queryKey: ['discussions', 'thread', row.target, row.targetId],
    queryFn: () =>
      api.get<{ context: Row['context']; data: ThreadPost[] }>(
        `/admin/discussions/${row.target}/${row.targetId}`,
        { limit: 50 },
      ),
  });
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setError(null);
    try {
      await api.post(`/admin/discussions/${row.target}/${row.targetId}/posts`, {
        body: body.trim(),
        parentId: replyTo,
      });
      setBody('');
      setReplyTo(null);
      await qc.invalidateQueries({ queryKey: ['discussions'] });
      toast.success('Answer posted');
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const post = (p: ThreadPost, isReply: boolean) => (
    <div key={p.id} className={cn('rounded-md border border-border p-3', isReply && 'ml-6')}>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <span className="font-semibold text-text">{p.deleted ? 'Deleted' : p.author}</span>
        {p.staff ? <Badge tone="primary">Teacher</Badge> : null}
        {p.best ? <Badge tone="success">Best answer</Badge> : null}
        {p.status === 'hidden' ? <Badge tone="danger">Hidden</Badge> : null}
        <span>{formatRelative(p.createdAt)}</span>
      </div>
      <p className="whitespace-pre-line text-sm">{p.deleted ? '—' : p.body}</p>
      {isReply && !p.deleted && p.status !== 'hidden' ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          onClick={() =>
            void act(
              () =>
                p.best
                  ? api.delete(`/admin/discussions/posts/${p.id}/best`)
                  : api.put(`/admin/discussions/posts/${p.id}/best`),
              p.best ? 'Best answer cleared' : 'Marked as the best answer',
            )
          }
        >
          {p.best ? 'Clear best answer' : 'Mark best answer'}
        </Button>
      ) : null}
      {!isReply && !p.deleted && p.status !== 'hidden' ? (
        <Button size="sm" variant="secondary" className="mt-2" onClick={() => setReplyTo(p.id)}>
          Answer
        </Button>
      ) : null}
    </div>
  );
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Discussion"
      description={row.context ? `${row.context.title} · ${localized(row.context.subject)}` : undefined}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {thread.isPending ? (
        <Spinner />
      ) : thread.isError ? (
        <ErrorState error={thread.error} onRetry={() => void thread.refetch()} />
      ) : (
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {thread.data.data.map((p) => (
            <div key={p.id} className="flex flex-col gap-2">
              {post(p, false)}
              {p.replies?.map((r) => post(r, true))}
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field
          label={replyTo ? 'Your answer (as a teacher)' : 'Post to this discussion (as a teacher)'}
          hint={replyTo ? undefined : 'Choose Answer on a question to reply to it.'}
        >
          {(a) => <Textarea {...a} value={body} onChange={(e) => setBody(e.target.value)} />}
        </Field>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void send()}>
            Post
          </Button>
          {replyTo ? (
            <Button size="sm" variant="secondary" onClick={() => setReplyTo(null)}>
              Not a reply
            </Button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

/** Discussions / doubts (D-066): reported posts first; teachers answer, mark the best answer and moderate. */
export function DiscussionsPage() {
  const act = useAct();
  const [view, setView] = useState<View>('reported');
  const [hiding, setHiding] = useState<Row | null>(null);
  const [banning, setBanning] = useState<Row | null>(null);
  const [opened, setOpened] = useState<Row | null>(null);
  const list = useInfiniteQuery({
    queryKey: ['discussions', view],
    queryFn: ({ pageParam }) =>
      api.get<CursorPage<Row>>('/admin/discussions', { view, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <PageHeader
        title="Discussions"
        description="Students ask doubts under questions and lessons; their posts show at once. Answer as a teacher, mark the best answer, and act on reported posts."
      />
      <div className="mb-4 flex gap-1 border-b border-border" role="tablist" aria-label="Posts">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={view === tab.value}
            onClick={() => setView(tab.value)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-semibold',
              view === tab.value
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
          <EmptyState title={view === 'reported' ? 'No reported posts' : 'No posts here'} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{r.target === 'question' ? 'Question' : 'Lesson'}</Badge>
                    <span className="line-clamp-1 text-sm font-medium">
                      {r.context ? `${r.context.title} · ${localized(r.context.subject)}` : 'Removed content'}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">
                    {r.author.name}
                    {r.author.email ? ` · ${r.author.email}` : ''} · {formatRelative(r.createdAt)}
                    {r.author.staff ? ' · Teacher' : ''}
                    {r.author.bannedUntil
                      ? r.author.bannedUntil === 'forever'
                        ? ' · Cannot post'
                        : ` · Cannot post until ${formatDateTimeBs(r.author.bannedUntil)}`
                      : ''}
                  </p>
                  {r.parentBody ? (
                    <p className="mt-1 line-clamp-1 text-xs text-text-muted">Reply to: “{r.parentBody}”</p>
                  ) : null}
                  <p className="mt-1 whitespace-pre-line text-sm">{r.body}</p>
                  {r.reports.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.reports.map((rep, i) => (
                        <Badge key={i} tone="danger">
                          {REASON[rep.reason]}
                          {rep.message ? `: ${rep.message}` : ''}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {r.status === 'hidden' ? (
                    <p className="mt-1 text-xs text-text-muted">
                      Hidden by {r.hiddenBy ?? '—'} · {r.hiddenReason}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setOpened(r)}>
                    Open discussion
                  </Button>
                  {r.status === 'hidden' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void act(
                          () => api.post(`/admin/discussions/posts/${r.id}/unhide`),
                          'Post shown again',
                        )
                      }
                    >
                      Show again
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setHiding(r)}>
                      Hide
                    </Button>
                  )}
                  {view === 'reported' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void act(
                          () => api.post(`/admin/discussions/posts/${r.id}/dismiss-reports`),
                          'Reports dismissed',
                        )
                      }
                    >
                      Keep post
                    </Button>
                  ) : null}
                  {!r.author.staff ? (
                    r.author.bannedUntil ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          void act(
                            () => api.delete(`/admin/discussions/bans/${r.author.id}`),
                            'Posting allowed',
                          )
                        }
                      >
                        Allow posting
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => setBanning(r)}>
                        Stop posting
                      </Button>
                    )
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
      {hiding ? <HideDialog row={hiding} onClose={() => setHiding(null)} /> : null}
      {banning ? <BanDialog row={banning} onClose={() => setBanning(null)} /> : null}
      {opened ? <ThreadDialog row={opened} onClose={() => setOpened(null)} /> : null}
    </>
  );
}
