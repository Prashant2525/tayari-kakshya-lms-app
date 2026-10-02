import type { QuestionType } from '@tk/contracts';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Download, Flag, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu } from 'radix-ui';
import { useState } from 'react';
import { StatusBadge } from '@/components/content/status';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { CursorPage, SubjectRow } from '@/lib/content';
import { formatRelative, localized } from '@/lib/format';
import { DIFFICULTY_LABEL, QUESTION_TYPE_LABEL, useQuestionTypes, type QuestionRow } from '@/lib/questions';

const TYPES = Object.keys(QUESTION_TYPE_LABEL) as QuestionType[];
const menuItem =
  'flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-2 text-sm text-text outline-none data-[highlighted]:bg-surface-muted';

export function QuestionsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const questionTypes = useQuestionTypes();
  const [downloading, setDownloading] = useState(false);
  const [filters, setFilters] = useState({
    q: '',
    subjectId: '',
    type: '',
    difficulty: '',
    status: '',
    tag: '',
    pyq: '',
  });
  const set = (key: keyof typeof filters, value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const subjects = useQuery({
    queryKey: ['subjects', 'all'],
    queryFn: () => api.get<CursorPage<SubjectRow>>('/admin/subjects', { limit: 100 }),
  });
  const list = useInfiniteQuery({
    queryKey: ['questions', filters],
    queryFn: ({ pageParam }) =>
      api.get<CursorPage<QuestionRow>>('/admin/questions', { ...filters, cursor: pageParam, limit: 40 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader
        title="Question bank"
        description="Questions are shared by quizzes, tests and mock exams. Edits create a new version; past attempts keep what students saw."
        actions={
          can('questions:edit') ? (
            <>
              <Button
                variant="secondary"
                loading={downloading}
                onClick={async () => {
                  setDownloading(true);
                  try {
                    await api.download('/admin/questions/import-template', 'question-import-template.xlsx');
                  } catch (err) {
                    toast.error(errorMessage(err));
                  } finally {
                    setDownloading(false);
                  }
                }}
              >
                <Download /> Import template
              </Button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button>
                    <Plus /> New question
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={4}
                    className="z-50 min-w-56 rounded-md border border-border bg-surface-raised p-1 shadow-e2"
                  >
                    {questionTypes.enabled.map((t) => (
                      <DropdownMenu.Item
                        key={t}
                        className={menuItem}
                        onSelect={() => void navigate({ to: '/questions/new', search: { type: t } })}
                      >
                        {questionTypes.label(t)}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </>
          ) : undefined
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={filters.q}
              onChange={(e) => set('q', e.target.value)}
              placeholder="Search question and option text"
              className="pl-9"
              aria-label="Search questions"
            />
          </div>
          <Select
            aria-label="Subject"
            value={filters.subjectId}
            onChange={(e) => set('subjectId', e.target.value)}
            className="w-auto"
          >
            <option value="">All subjects</option>
            {(subjects.data?.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {localized(s.name)}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Type"
            value={filters.type}
            onChange={(e) => set('type', e.target.value)}
            className="w-auto"
          >
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {questionTypes.label(t)}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Difficulty"
            value={filters.difficulty}
            onChange={(e) => set('difficulty', e.target.value)}
            className="w-auto"
          >
            <option value="">Any difficulty</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
          <Select
            aria-label="Status"
            value={filters.status}
            onChange={(e) => set('status', e.target.value)}
            className="w-auto"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="in_review">In review</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </Select>
          <Select
            aria-label="Previous-year questions"
            value={filters.pyq}
            onChange={(e) => set('pyq', e.target.value)}
            className="w-auto"
          >
            <option value="">PYQ and others</option>
            <option value="true">Previous-year only</option>
            <option value="false">Not previous-year</option>
          </Select>
          <Input
            value={filters.tag}
            onChange={(e) => set('tag', e.target.value)}
            placeholder="Tag"
            aria-label="Tag"
            className="w-36"
          />
        </div>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={filtered ? 'No matching questions' : 'The question bank is empty'}
            description="Add questions one by one, or import a spreadsheet."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Question</TH>
                  <TH>Type</TH>
                  <TH>Subject</TH>
                  <TH>Status</TH>
                  <TH>Updated</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((q) => (
                  <TR key={q.id} className="hover:bg-surface-muted/50">
                    <TD className="max-w-md">
                      <Link
                        to="/questions/$questionId"
                        params={{ questionId: q.id }}
                        className="line-clamp-2 font-medium text-text hover:text-link"
                      >
                        {q.preview || <span className="text-text-muted">(no text — image only)</span>}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge>{DIFFICULTY_LABEL[q.difficulty]}</Badge>
                        {q.accessLevel === 'premium' ? (
                          <Badge tone="premium">Premium</Badge>
                        ) : (
                          <Badge>Free</Badge>
                        )}
                        {q.isPyq ? <Badge tone="primary">PYQ</Badge> : null}
                        {q.tags.slice(0, 4).map((t) => (
                          <span key={t} className="text-xs text-text-muted">
                            #{t}
                          </span>
                        ))}
                        {q.openReports ? (
                          <Badge tone="danger">
                            <Flag className="size-3" aria-hidden /> {q.openReports}
                          </Badge>
                        ) : null}
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap text-text-secondary">{questionTypes.label(q.type)}</TD>
                    <TD className="text-text-secondary">
                      {localized(q.subject)}
                      {q.topic ? (
                        <span className="block text-xs text-text-muted">{localized(q.topic)}</span>
                      ) : null}
                    </TD>
                    <TD>
                      <StatusBadge status={q.status} deleted={Boolean(q.deletedAt)} />
                    </TD>
                    <TD className="whitespace-nowrap text-text-secondary">{formatRelative(q.updatedAt)}</TD>
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
