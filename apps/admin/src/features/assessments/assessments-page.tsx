import type { AssessmentType } from '@tk/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Plus, Search } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useState } from 'react';
import { StatusBadge } from '@/components/content/status';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { ASSESSMENT_TYPE_LABEL, type AssessmentRow } from '@/lib/assessments';
import { useAuth } from '@/lib/auth';
import type { CursorPage } from '@/lib/content';
import { formatDateBs, formatDateTimeBs, localized } from '@/lib/format';

const TYPES = Object.keys(ASSESSMENT_TYPE_LABEL) as AssessmentType[];
const menuItem =
  'flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-2 text-sm text-text outline-none data-[highlighted]:bg-surface-muted';

function when(a: AssessmentRow): string {
  if (a.type === 'daily_challenge' && a.challengeDate) return formatDateBs(`${a.challengeDate}T06:00:00Z`);
  if (a.availability === 'window') return `${formatDateTimeBs(a.opensAt)} → ${formatDateTimeBs(a.closesAt)}`;
  return 'Always open';
}

export function AssessmentsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const list = useInfiniteQuery({
    queryKey: ['assessments', { q, type, status }],
    queryFn: ({ pageParam }) =>
      api.get<CursorPage<AssessmentRow>>('/admin/assessments', {
        q,
        type,
        status,
        cursor: pageParam,
        limit: 30,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader
        title="Assessments"
        description="Quizzes, subject tests, weekly and mock exams, previous-year mocks and daily challenges. Every rule is set per assessment."
        actions={
          can('assessments:edit') ? (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button>
                  <Plus /> New assessment
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  className="z-50 min-w-56 rounded-md border border-border bg-surface-raised p-1 shadow-e2"
                >
                  {TYPES.map((t) => (
                    <DropdownMenu.Item
                      key={t}
                      className={menuItem}
                      onSelect={() => void navigate({ to: '/assessments/new', search: { type: t } })}
                    >
                      {ASSESSMENT_TYPE_LABEL[t]}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
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
              placeholder="Search by title"
              className="pl-9"
              aria-label="Search assessments"
            />
          </div>
          <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} className="w-auto">
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {ASSESSMENT_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-auto"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="in_review">In review</option>
            <option value="scheduled">Scheduled</option>
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
            title={q || type || status ? 'No matching assessments' : 'No assessments yet'}
            description="Create a quiz or exam, choose its rules, then add questions from the question bank."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Assessment</TH>
                  <TH>Questions</TH>
                  <TH>When</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((a) => (
                  <TR key={a.id} className="hover:bg-surface-muted/50">
                    <TD>
                      <Link
                        to="/assessments/$assessmentId"
                        params={{ assessmentId: a.id }}
                        className="font-semibold text-text hover:text-link"
                      >
                        {localized(a.title)}
                      </Link>
                      <p className="text-xs text-text-muted">
                        {ASSESSMENT_TYPE_LABEL[a.type]}
                        {a.course
                          ? ` · ${localized(a.course)}`
                          : a.subject
                            ? ` · ${localized(a.subject)}`
                            : ''}
                      </p>
                    </TD>
                    <TD>{a.questionCount}</TD>
                    <TD className="text-sm text-text-secondary">{when(a)}</TD>
                    <TD>
                      <StatusBadge status={a.status} publishAt={a.publishAt} />
                    </TD>
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
    </>
  );
}
