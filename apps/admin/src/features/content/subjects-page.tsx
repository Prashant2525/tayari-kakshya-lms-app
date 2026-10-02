import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { BookOpen, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from '@/components/content/status';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { type CursorPage, type SubjectRow } from '@/lib/content';
import { formatRelative, plural } from '@/lib/format';
import { SubjectDialog } from './subject-dialog';

export function SubjectsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useInfiniteQuery({
    queryKey: ['subjects', { q, status }],
    queryFn: ({ pageParam }) =>
      api.get<CursorPage<SubjectRow>>('/admin/subjects', { q, status, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader
        title="Subjects"
        description="Subjects hold chapters, topics, notes, PDFs and videos. Courses include subjects, so one subject can serve several courses."
        actions={
          can('content:edit') ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> Add subject
            </Button>
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
              placeholder="Search subjects"
              className="pl-9"
              aria-label="Search subjects"
            />
          </div>
          <Select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-auto"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="in_review">In review</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </Select>
        </div>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={q || status ? 'No matching subjects' : 'No subjects yet'}
            description="Create a subject, then add its chapters, topics and learning material."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Subject</TH>
                  <TH>Chapters</TH>
                  <TH>Used by</TH>
                  <TH>Status</TH>
                  <TH>Updated</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((s) => (
                  <TR key={s.id} className="hover:bg-surface-muted/50">
                    <TD>
                      <Link
                        to="/subjects/$subjectId"
                        params={{ subjectId: s.id }}
                        className="flex items-center gap-3 font-semibold text-text hover:text-link"
                      >
                        {s.iconUrl ? (
                          <img src={s.iconUrl} alt="" className="size-9 rounded-sm object-cover" />
                        ) : (
                          <span className="grid size-9 place-items-center rounded-sm bg-primary-soft text-on-primary-soft">
                            <BookOpen className="size-4" aria-hidden />
                          </span>
                        )}
                        <span>
                          {s.name.en ?? s.name.ne}
                          {s.name.en && s.name.ne ? (
                            <span className="block text-xs font-normal text-text-secondary" lang="ne">
                              {s.name.ne}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </TD>
                    <TD>{s.chapterCount}</TD>
                    <TD className="text-text-secondary">
                      {s.courseCount ? plural(s.courseCount, 'course') : '—'}
                    </TD>
                    <TD>
                      <StatusBadge status={s.status} deleted={Boolean(s.deletedAt)} />
                    </TD>
                    <TD className="whitespace-nowrap text-text-secondary">{formatRelative(s.updatedAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {list.hasNextPage ? (
              <div className="flex justify-center p-4">
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
      </Card>
      {creating ? (
        <SubjectDialog
          subject={null}
          onClose={() => setCreating(false)}
          onCreated={(id) => void navigate({ to: '/subjects/$subjectId', params: { subjectId: id } })}
        />
      ) : null}
    </>
  );
}
