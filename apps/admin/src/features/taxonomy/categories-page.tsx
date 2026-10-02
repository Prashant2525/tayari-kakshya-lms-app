import { zodResolver } from '@hookform/resolvers/zod';
import { EXAM_NODE_RANK, type ExamNodeType, type PublishStatus } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { MediaField } from '@/components/content/media-picker';
import { StatusBadge } from '@/components/content/status';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Card, EmptyState, ErrorState, PageHeader, Spinner, Switch } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { NODE_TYPE_LABEL, slugify, toLocalized, type ExamNode } from '@/lib/content';
import { localized, plural } from '@/lib/format';
import { cn } from '@/lib/utils';

const TYPES = Object.keys(EXAM_NODE_RANK) as ExamNodeType[];
const childTypes = (parent: ExamNode | null) =>
  parent
    ? TYPES.filter((t) => EXAM_NODE_RANK[t] > EXAM_NODE_RANK[parent.nodeType])
    : (['authority'] as const);

const menuItem =
  'flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-2 text-sm text-text outline-none data-[highlighted]:bg-surface-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

const schema = z
  .object({
    // Not `nodeType`: a form control with that name would shadow HTMLFormElement.nodeType (DOM clobbering).
    kind: z.enum(['authority', 'level', 'service', 'group', 'post']),
    parentId: z.string().nullable(),
    nameEn: z.string().trim().max(200),
    nameNe: z.string().trim().max(200),
    slug: z
      .string()
      .trim()
      .min(1, 'Enter a URL name')
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens'),
    descEn: z.string().trim().max(2000),
    descNe: z.string().trim().max(2000),
    iconMediaId: z.string().nullable(),
  })
  .refine((v) => v.nameEn || v.nameNe, {
    path: ['nameEn'],
    message: 'Enter the name in English, Nepali or both',
  })
  .refine((v) => v.kind === 'authority' || v.parentId, {
    path: ['parentId'],
    message: 'Choose where this belongs',
  });
type FormValues = z.infer<typeof schema>;

/** Path label such as "Nepal Police › Inspector" for parent choices. */
function pathLabel(node: ExamNode, byId: Map<string, ExamNode>): string {
  const parts: string[] = [];
  let current: ExamNode | undefined = node;
  while (current) {
    parts.unshift(localized(current.name));
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return parts.join(' › ');
}

function NodeDialog({
  node,
  parent,
  nodes,
  onClose,
}: {
  node: ExamNode | null;
  parent: ExamNode | null;
  nodes: ExamNode[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const initialType = node?.nodeType ?? childTypes(parent)[0] ?? 'authority';
  const [slugTouched, setSlugTouched] = useState(Boolean(node));
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: initialType,
      parentId: node ? node.parentId : (parent?.id ?? null),
      nameEn: node?.name.en ?? '',
      nameNe: node?.name.ne ?? '',
      slug: node?.slug ?? '',
      descEn: node?.description?.en ?? '',
      descNe: node?.description?.ne ?? '',
      iconMediaId: node?.iconMediaId ?? null,
    },
  });
  const nodeType = useWatch({ control: form.control, name: 'kind' });
  const parentId = useWatch({ control: form.control, name: 'parentId' });
  const parentNode = parentId ? byId.get(parentId) : undefined;

  // Descendants cannot become the parent (it would create a loop).
  const descendants = useMemo(() => {
    const out = new Set<string>();
    if (!node) return out;
    const walk = (id: string) => {
      for (const n of nodes) {
        if (n.parentId === id && !out.has(n.id)) {
          out.add(n.id);
          walk(n.id);
        }
      }
    };
    walk(node.id);
    return out;
  }, [node, nodes]);
  const parentOptions = nodes
    .filter((n) => !n.deletedAt && n.id !== node?.id && !descendants.has(n.id))
    .filter((n) => EXAM_NODE_RANK[n.nodeType] < EXAM_NODE_RANK[nodeType])
    .map((n) => ({ id: n.id, label: `${pathLabel(n, byId)} (${NODE_TYPE_LABEL[n.nodeType]})` }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const typeOptions = node ? TYPES : parent ? childTypes(parent) : TYPES;

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    const body = {
      parentId: v.kind === 'authority' ? null : v.parentId,
      nodeType: v.kind,
      name: toLocalized(v.nameEn, v.nameNe),
      slug: v.slug,
      description: toLocalized(v.descEn, v.descNe),
      iconMediaId: v.iconMediaId,
    };
    try {
      if (node) await api.put(`/admin/exam-nodes/${node.id}`, body);
      else await api.post('/admin/exam-nodes', body);
      await qc.invalidateQueries({ queryKey: ['exam-nodes'] });
      toast.success(node ? 'Category updated' : 'Category added');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  const errors = form.formState.errors;
  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={node ? 'Edit category' : parent ? `Add inside ${localized(parent.name)}` : 'Add an authority'}
      description="Authorities hold levels, services, groups and posts. Students browse this tree to find courses."
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
          <Field label="Type" error={errors.kind?.message}>
            {(a) => (
              <Select {...a} {...form.register('kind')}>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {NODE_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {nodeType !== 'authority' ? (
            <Field
              label="Belongs to"
              error={errors.parentId?.message}
              hint={parentNode ? undefined : 'Levels, services and groups are optional steps.'}
            >
              {(a) => (
                <Controller
                  control={form.control}
                  name="parentId"
                  render={({ field }) => (
                    <Select
                      {...a}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    >
                      <option value="">Choose…</option>
                      {parentOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              )}
            </Field>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name (English)" error={errors.nameEn?.message}>
            {(a) => (
              <Input
                {...a}
                {...form.register('nameEn', {
                  onChange: (e: { target: { value: string } }) => {
                    if (!slugTouched) form.setValue('slug', slugify(e.target.value));
                  },
                })}
                placeholder="e.g. Nepal Police"
              />
            )}
          </Field>
          <Field label="नाम (नेपाली)">
            {(a) => <Input {...a} lang="ne" {...form.register('nameNe')} placeholder="जस्तै: नेपाल प्रहरी" />}
          </Field>
        </div>
        <Field
          label="URL name"
          hint="Used in web addresses. Lowercase letters, numbers and hyphens."
          error={errors.slug?.message}
        >
          {(a) => <Input {...a} {...form.register('slug', { onChange: () => setSlugTouched(true) })} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Description (English)">
            {(a) => <Textarea {...a} {...form.register('descEn')} />}
          </Field>
          <Field label="विवरण (नेपाली)">
            {(a) => <Textarea {...a} lang="ne" {...form.register('descNe')} />}
          </Field>
        </div>
        <Controller
          control={form.control}
          name="iconMediaId"
          render={({ field }) => (
            <MediaField kind="image" label="Icon or emblem" value={field.value} onChange={field.onChange} />
          )}
        />
      </form>
    </Dialog>
  );
}

interface TreeNode extends ExamNode {
  children: TreeNode[];
}

function buildTree(nodes: ExamNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>(nodes.map((n) => [n.id, { ...n, children: [] }]));
  const roots: TreeNode[] = [];
  for (const n of map.values()) {
    const parent = n.parentId ? map.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }
  const sort = (list: TreeNode[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

export function CategoriesPage() {
  const qc = useQueryClient();
  const [showDeleted, setShowDeleted] = useState(false);
  const nodes = useQuery({
    queryKey: ['exam-nodes', { showDeleted }],
    queryFn: () => api.get<ExamNode[]>('/admin/exam-nodes', { includeDeleted: showDeleted || undefined }),
  });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ node: ExamNode | null; parent: ExamNode | null } | null>(null);
  const [deleting, setDeleting] = useState<ExamNode | null>(null);
  const [busy, setBusy] = useState(false);
  const tree = useMemo(() => buildTree(nodes.data ?? []), [nodes.data]);

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['exam-nodes'] });
      toast.success(success);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const setStatus = (n: ExamNode, status: PublishStatus, label: string) =>
    run(() => api.put(`/admin/exam-nodes/${n.id}/status`, { status }), label);
  const move = (siblings: TreeNode[], index: number, delta: -1 | 1) => {
    const live = siblings.filter((s) => !s.deletedAt);
    const from = live.indexOf(siblings[index] as TreeNode);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= live.length) return;
    const ids = live.map((s) => s.id);
    [ids[from], ids[to]] = [ids[to] as string, ids[from] as string];
    void run(
      () => api.put('/admin/exam-nodes/order', { parentId: siblings[index]?.parentId ?? null, ids }),
      'Order saved',
    );
  };

  const renderList = (list: TreeNode[], depth: number) => (
    <ul className={cn(depth > 0 && 'border-l border-border', depth > 0 && 'ml-5')}>
      {list.map((n, index) => {
        const open = !collapsed.has(n.id);
        const live = list.filter((s) => !s.deletedAt);
        const position = live.indexOf(n);
        return (
          <li key={n.id}>
            <div
              className={cn(
                'flex items-center gap-2 py-2 pr-3',
                depth > 0 ? 'pl-3' : 'pl-1',
                n.deletedAt && 'opacity-60',
              )}
            >
              <Button
                variant="ghost"
                size="icon"
                className={cn('size-7', n.children.length === 0 && 'invisible')}
                aria-label={open ? `Collapse ${localized(n.name)}` : `Expand ${localized(n.name)}`}
                aria-expanded={open}
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(n.id)) next.delete(n.id);
                    else next.add(n.id);
                    return next;
                  })
                }
              >
                {open ? <ChevronDown /> : <ChevronRight />}
              </Button>
              {n.iconUrl ? (
                <img src={n.iconUrl} alt="" className="size-8 shrink-0 rounded-sm object-cover" />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-text">
                  {n.name.en ?? n.name.ne}
                  {n.name.en && n.name.ne ? (
                    <span className="ml-2 font-normal text-text-secondary" lang="ne">
                      {n.name.ne}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-text-muted">
                  {NODE_TYPE_LABEL[n.nodeType]} · /{n.slug}
                  {n.courseCount ? ` · ${plural(n.courseCount, 'course')}` : ''}
                  {n.paperCount ? ` · ${plural(n.paperCount, 'paper')}` : ''}
                </p>
              </div>
              <StatusBadge status={n.status} deleted={Boolean(n.deletedAt)} />
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Actions for ${localized(n.name)}`}
                    disabled={busy}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={4}
                    className="z-50 min-w-52 rounded-md border border-border bg-surface-raised p-1 shadow-e2"
                  >
                    {n.deletedAt ? (
                      <DropdownMenu.Item
                        className={menuItem}
                        onSelect={() =>
                          void run(() => api.post(`/admin/exam-nodes/${n.id}/restore`), 'Category restored')
                        }
                      >
                        <RotateCcw className="size-4" /> Restore
                      </DropdownMenu.Item>
                    ) : (
                      <>
                        {n.nodeType !== 'post' ? (
                          <DropdownMenu.Item
                            className={menuItem}
                            onSelect={() => setEditing({ node: null, parent: n })}
                          >
                            <Plus className="size-4" /> Add inside
                          </DropdownMenu.Item>
                        ) : null}
                        <DropdownMenu.Item
                          className={menuItem}
                          onSelect={() => setEditing({ node: n, parent: null })}
                        >
                          <Pencil className="size-4" /> Edit
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator className="my-1 h-px bg-border" />
                        {n.status !== 'published' ? (
                          <DropdownMenu.Item
                            className={menuItem}
                            onSelect={() => void setStatus(n, 'published', 'Published')}
                          >
                            Publish
                          </DropdownMenu.Item>
                        ) : (
                          <DropdownMenu.Item
                            className={menuItem}
                            onSelect={() => void setStatus(n, 'draft', 'Moved to draft')}
                          >
                            Unpublish (draft)
                          </DropdownMenu.Item>
                        )}
                        {n.status !== 'archived' ? (
                          <DropdownMenu.Item
                            className={menuItem}
                            onSelect={() => void setStatus(n, 'archived', 'Archived')}
                          >
                            Archive
                          </DropdownMenu.Item>
                        ) : null}
                        <DropdownMenu.Separator className="my-1 h-px bg-border" />
                        <DropdownMenu.Item
                          className={menuItem}
                          disabled={position <= 0}
                          onSelect={() => move(list, index, -1)}
                        >
                          <ArrowUp className="size-4" /> Move up
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          className={menuItem}
                          disabled={position === -1 || position >= live.length - 1}
                          onSelect={() => move(list, index, 1)}
                        >
                          <ArrowDown className="size-4" /> Move down
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator className="my-1 h-px bg-border" />
                        <DropdownMenu.Item
                          className={cn(menuItem, 'text-danger')}
                          onSelect={() => setDeleting(n)}
                        >
                          <Trash2 className="size-4" /> Delete
                        </DropdownMenu.Item>
                      </>
                    )}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
            {open && n.children.length ? renderList(n.children, depth + 1) : null}
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <PageHeader
        title="Exam categories"
        description="Authority → level → service → group → post. Students only see published categories whose parents are published too."
        actions={
          <Button onClick={() => setEditing({ node: null, parent: null })}>
            <Plus /> Add authority
          </Button>
        }
      />
      <Card>
        <div className="flex items-center justify-end gap-3 border-b border-border px-5 py-3">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            Show deleted
            <Switch checked={showDeleted} onCheckedChange={setShowDeleted} label="Show deleted" />
          </label>
        </div>
        {nodes.isPending ? (
          <Spinner />
        ) : nodes.isError ? (
          <ErrorState error={nodes.error} onRetry={() => void nodes.refetch()} />
        ) : tree.length === 0 ? (
          <EmptyState
            title="No categories yet"
            description="Start with an authority such as Lok Sewa Aayog or Nepal Police, then add posts inside it."
            action={
              <Button onClick={() => setEditing({ node: null, parent: null })}>
                <Plus /> Add the first authority
              </Button>
            }
          />
        ) : (
          <div className="px-3 py-2">{renderList(tree, 0)}</div>
        )}
      </Card>
      <p className="mt-3 text-xs text-text-muted">
        Courses and papers attach to posts. A category can be deleted only once it is empty.
      </p>

      {editing ? (
        <NodeDialog
          node={editing.node}
          parent={editing.parent}
          nodes={nodes.data ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Delete ${localized(deleting.name)}?`}
          description="It disappears from the app and can be restored later from “Show deleted”."
          confirmLabel="Delete"
          onConfirm={async () => {
            await api.delete(`/admin/exam-nodes/${deleting.id}`);
            await qc.invalidateQueries({ queryKey: ['exam-nodes'] });
            toast.success('Category deleted');
          }}
        />
      ) : null}
    </>
  );
}
