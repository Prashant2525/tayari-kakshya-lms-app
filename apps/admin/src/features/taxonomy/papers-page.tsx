import { zodResolver } from '@hookform/resolvers/zod';
import type { PublishStatus } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import {
  Alert,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
} from '@/components/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { toLocalized, type ExamNode, type Paper } from '@/lib/content';
import { localized } from '@/lib/format';
import { useNodeTypes } from '@/lib/node-types';

const optionalNumber = (max: number, integer = false) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= max), {
      message: `Enter a number from 0 to ${max}`,
    })
    .refine((v) => !integer || v === '' || Number.isInteger(Number(v)), { message: 'Enter a whole number' });

const schema = z
  .object({
    nameEn: z.string().trim().max(200),
    nameNe: z.string().trim().max(200),
    code: z.string().trim().max(40),
    fullMarks: optionalNumber(9999.99),
    passMarks: optionalNumber(9999.99),
    durationMinutes: optionalNumber(1440, true),
    patternEn: z.string().trim().max(4000),
    patternNe: z.string().trim().max(4000),
    postIds: z.array(z.string()),
  })
  .refine((v) => v.nameEn || v.nameNe, {
    path: ['nameEn'],
    message: 'Enter the name in English, Nepali or both',
  })
  .refine((v) => !v.fullMarks || !v.passMarks || Number(v.passMarks) <= Number(v.fullMarks), {
    path: ['passMarks'],
    message: 'Pass marks cannot exceed full marks',
  });
type FormValues = z.infer<typeof schema>;
const numOrNull = (v: string) => (v === '' ? null : Number(v));

function PaperDialog({
  paper,
  posts,
  onClose,
}: {
  paper: Paper | null;
  posts: ExamNode[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [postFilter, setPostFilter] = useState('');
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nameEn: paper?.name.en ?? '',
      nameNe: paper?.name.ne ?? '',
      code: paper?.code ?? '',
      fullMarks: paper?.fullMarks?.toString() ?? '',
      passMarks: paper?.passMarks?.toString() ?? '',
      durationMinutes: paper?.durationMinutes?.toString() ?? '',
      patternEn: paper?.pattern?.en ?? '',
      patternNe: paper?.pattern?.ne ?? '',
      postIds: paper?.posts.map((p) => p.id) ?? [],
    },
  });
  const errors = form.formState.errors;
  const visiblePosts = posts.filter((p) =>
    localized(p.name).toLowerCase().includes(postFilter.trim().toLowerCase()),
  );

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    const body = {
      name: toLocalized(v.nameEn, v.nameNe),
      code: v.code || null,
      fullMarks: numOrNull(v.fullMarks),
      passMarks: numOrNull(v.passMarks),
      durationMinutes: numOrNull(v.durationMinutes),
      pattern: toLocalized(v.patternEn, v.patternNe),
      postIds: v.postIds,
    };
    try {
      if (paper) await api.put(`/admin/papers/${paper.id}`, body);
      else await api.post('/admin/papers', body);
      await qc.invalidateQueries({ queryKey: ['papers'] });
      toast.success(paper ? 'Paper updated' : 'Paper added');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={paper ? 'Edit paper' : 'Add a paper'}
      description="An exam paper (for example “Paper I: General Awareness”) with its official marks and time."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} loading={form.formState.isSubmitting}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {error ? <Alert tone="danger" title={error} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name (English)" error={errors.nameEn?.message}>
            {(a) => <Input {...a} {...form.register('nameEn')} placeholder="e.g. Paper I" />}
          </Field>
          <Field label="नाम (नेपाली)">{(a) => <Input {...a} lang="ne" {...form.register('nameNe')} />}</Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Code" error={errors.code?.message}>
            {(a) => <Input {...a} {...form.register('code')} />}
          </Field>
          <Field label="Full marks" error={errors.fullMarks?.message}>
            {(a) => <Input {...a} inputMode="decimal" {...form.register('fullMarks')} />}
          </Field>
          <Field label="Pass marks" error={errors.passMarks?.message}>
            {(a) => <Input {...a} inputMode="decimal" {...form.register('passMarks')} />}
          </Field>
          <Field label="Minutes" error={errors.durationMinutes?.message}>
            {(a) => <Input {...a} inputMode="numeric" {...form.register('durationMinutes')} />}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pattern (English)" hint="Sections, question types, marking.">
            {(a) => <Textarea {...a} {...form.register('patternEn')} />}
          </Field>
          <Field label="ढाँचा (नेपाली)">
            {(a) => <Textarea {...a} lang="ne" {...form.register('patternNe')} />}
          </Field>
        </div>
        <Controller
          control={form.control}
          name="postIds"
          render={({ field }) => (
            <fieldset className="rounded-sm border border-border p-3">
              <legend className="px-1 text-sm font-semibold text-text">Used for posts</legend>
              {posts.length === 0 ? (
                <p className="text-sm text-text-muted">Add posts under Exam categories first.</p>
              ) : (
                <>
                  <Input
                    value={postFilter}
                    onChange={(e) => setPostFilter(e.target.value)}
                    placeholder="Filter posts"
                    aria-label="Filter posts"
                    className="mb-2 h-9"
                  />
                  <ul className="max-h-48 overflow-y-auto">
                    {visiblePosts.map((p) => {
                      const id = `post-${p.id}`;
                      const checked = field.value.includes(p.id);
                      return (
                        <li key={p.id} className="flex items-center gap-2 py-1">
                          <Checkbox
                            id={id}
                            checked={checked}
                            onCheckedChange={(on) =>
                              field.onChange(
                                on ? [...field.value, p.id] : field.value.filter((x) => x !== p.id),
                              )
                            }
                          />
                          <label htmlFor={id} className="text-sm text-text">
                            {localized(p.name)}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </fieldset>
          )}
        />
      </form>
    </Dialog>
  );
}

export function PapersPage() {
  const qc = useQueryClient();
  const papers = useQuery({ queryKey: ['papers'], queryFn: () => api.get<Paper[]>('/admin/papers') });
  const nodes = useQuery({
    queryKey: ['exam-nodes', { showDeleted: false }],
    queryFn: () => api.get<ExamNode[]>('/admin/exam-nodes'),
  });
  const nodeTypes = useNodeTypes();
  // Papers link to categories whose type allows papers (posts, exam stages…), configured under Category types.
  const posts = useMemo(
    () => (nodes.data ?? []).filter((n) => nodeTypes.byKey.get(n.nodeType)?.canHavePapers),
    [nodes.data, nodeTypes.byKey],
  );
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Paper | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Paper | null>(null);

  const filtered = (papers.data ?? []).filter((p) =>
    `${p.name.en ?? ''} ${p.name.ne ?? ''} ${p.code ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const setStatus = async (p: Paper, status: PublishStatus) => {
    try {
      await api.put(`/admin/papers/${p.id}/status`, { status });
      await qc.invalidateQueries({ queryKey: ['papers'] });
      toast.success('Status updated');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Papers"
        description="Official exam papers with marks and time. Course subjects can link to a paper to show its marks."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> Add paper
          </Button>
        }
      />
      <Card>
        <div className="border-b border-border p-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search papers"
              className="pl-9"
              aria-label="Search papers"
            />
          </div>
        </div>
        {papers.isPending ? (
          <Spinner />
        ) : papers.isError ? (
          <ErrorState error={papers.error} onRetry={() => void papers.refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={q ? 'No matching papers' : 'No papers yet'}
            description="Add the papers of each exam, then link them to posts."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Paper</TH>
                <TH>Marks</TH>
                <TH>Time</TH>
                <TH>Posts</TH>
                <TH>Status</TH>
                <TH className="text-right">
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <p className="font-semibold">{localized(p.name)}</p>
                    {p.code ? <p className="text-xs text-text-muted">{p.code}</p> : null}
                  </TD>
                  <TD className="whitespace-nowrap">
                    {p.fullMarks ?? '—'}
                    {p.passMarks != null ? (
                      <span className="text-text-muted"> / pass {p.passMarks}</span>
                    ) : null}
                  </TD>
                  <TD className="whitespace-nowrap">
                    {p.durationMinutes ? `${p.durationMinutes} min` : '—'}
                  </TD>
                  <TD className="max-w-60 truncate text-text-secondary">
                    {p.posts.map((x) => localized(x.name)).join(', ') || '—'}
                  </TD>
                  <TD>
                    <Select
                      aria-label={`Status of ${localized(p.name)}`}
                      value={p.status}
                      onChange={(e) => void setStatus(p, e.target.value as PublishStatus)}
                      className="h-8 w-auto text-[13px]"
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="archived">Archived</option>
                    </Select>
                  </TD>
                  <TD className="whitespace-nowrap text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${localized(p.name)}`}
                      onClick={() => setEditing(p)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${localized(p.name)}`}
                      onClick={() => setDeleting(p)}
                    >
                      <Trash2 />
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {editing ? (
        <PaperDialog
          paper={editing === 'new' ? null : editing}
          posts={posts}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Delete ${localized(deleting.name)}?`}
          description="Papers used by a course cannot be deleted; remove them from those courses first."
          confirmLabel="Delete"
          onConfirm={async () => {
            await api.delete(`/admin/papers/${deleting.id}`);
            await qc.invalidateQueries({ queryKey: ['papers'] });
            toast.success('Paper deleted');
          }}
        />
      ) : null}
    </>
  );
}
