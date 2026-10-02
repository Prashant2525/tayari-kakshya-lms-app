import { zodResolver } from '@hookform/resolvers/zod';
import { formatNpr } from '@tk/domain';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { GraduationCap, Plus, Search, Star } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { StatusBadge } from '@/components/content/status';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Card, EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { slugify, toLocalized, type CourseRow, type CursorPage } from '@/lib/content';
import { formatRelative } from '@/lib/format';

const schema = z
  .object({
    titleEn: z.string().trim().max(200),
    titleNe: z.string().trim().max(200),
    slug: z
      .string()
      .trim()
      .min(1, 'Enter a URL name')
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens'),
  })
  .refine((v) => v.titleEn || v.titleNe, {
    path: ['titleEn'],
    message: 'Enter the title in English, Nepali or both',
  });
type FormValues = z.infer<typeof schema>;

function NewCourseDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { titleEn: '', titleNe: '', slug: '' },
  });
  const errors = form.formState.errors;
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const created = await api.post<{ id: string }>('/admin/courses', {
        slug: v.slug,
        title: toLocalized(v.titleEn, v.titleNe),
      });
      await qc.invalidateQueries({ queryKey: ['courses'] });
      toast.success('Course created as a draft');
      onClose();
      void navigate({ to: '/courses/$courseId', params: { courseId: created.id } });
    } catch (err) {
      setError(errorMessage(err));
    }
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New course"
      description="Start with a title; add pricing, subjects and links next."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} loading={form.formState.isSubmitting}>
            Create
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field label="Title (English)" error={errors.titleEn?.message}>
          {(a) => (
            <Input
              {...a}
              {...form.register('titleEn', {
                onChange: (e: { target: { value: string } }) => {
                  if (!slugTouched) form.setValue('slug', slugify(e.target.value));
                },
              })}
              placeholder="e.g. Kharidar Complete Course"
            />
          )}
        </Field>
        <Field label="शीर्षक (नेपाली)">
          {(a) => <Input {...a} lang="ne" {...form.register('titleNe')} />}
        </Field>
        <Field label="URL name" hint="Course address on the website." error={errors.slug?.message}>
          {(a) => <Input {...a} {...form.register('slug', { onChange: () => setSlugTouched(true) })} />}
        </Field>
      </form>
    </Dialog>
  );
}

export function priceLabel(c: Pick<CourseRow, 'pricePaisa' | 'salePricePaisa'>): string {
  if (c.pricePaisa === 0) return 'Free';
  return formatNpr(c.pricePaisa, 'en');
}

export function CoursesPage() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useInfiniteQuery({
    queryKey: ['courses', { q, status }],
    queryFn: ({ pageParam }) =>
      api.get<CursorPage<CourseRow>>('/admin/courses', { q, status, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader
        title="Courses"
        description="What students buy or join: subjects, prices, validity and the exams they prepare for."
        actions={
          can('courses:edit') ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New course
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
              placeholder="Search by title or URL name"
              className="pl-9"
              aria-label="Search courses"
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
            title={q || status ? 'No matching courses' : 'No courses yet'}
            description="Create a course, then add its subjects and pricing."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Course</TH>
                  <TH>Price</TH>
                  <TH>Subjects</TH>
                  <TH>Status</TH>
                  <TH>Updated</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((c) => (
                  <TR key={c.id} className="hover:bg-surface-muted/50">
                    <TD>
                      <Link
                        to="/courses/$courseId"
                        params={{ courseId: c.id }}
                        className="flex items-center gap-3 font-semibold text-text hover:text-link"
                      >
                        {c.thumbnailUrl ? (
                          <img src={c.thumbnailUrl} alt="" className="h-9 w-14 rounded-sm object-cover" />
                        ) : (
                          <span className="grid h-9 w-14 place-items-center rounded-sm bg-primary-soft text-on-primary-soft">
                            <GraduationCap className="size-4" aria-hidden />
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            {c.title.en ?? c.title.ne}
                            {c.isFeatured ? (
                              <Star className="size-3.5 fill-current text-warning" aria-label="Featured" />
                            ) : null}
                          </span>
                          <span className="block text-xs font-normal text-text-muted">/{c.slug}</span>
                        </span>
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {priceLabel(c)}
                      {c.salePricePaisa !== null && c.pricePaisa > 0 ? (
                        <span className="block text-xs text-text-muted">
                          Sale {formatNpr(c.salePricePaisa, 'en')}
                        </span>
                      ) : null}
                    </TD>
                    <TD>{c.subjectCount}</TD>
                    <TD>
                      <StatusBadge status={c.status} publishAt={c.publishAt} deleted={Boolean(c.deletedAt)} />
                    </TD>
                    <TD className="whitespace-nowrap text-text-secondary">{formatRelative(c.updatedAt)}</TD>
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
      {creating ? <NewCourseDialog onClose={() => setCreating(false)} /> : null}
    </>
  );
}
