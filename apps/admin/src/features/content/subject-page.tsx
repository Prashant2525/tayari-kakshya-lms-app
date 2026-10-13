import { zodResolver } from '@hookform/resolvers/zod';
import type { PublishStatus } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  FileText,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { StatusBadge } from '@/components/content/status';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, EmptyState, ErrorState, Spinner } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  formatDuration,
  ITEM_TYPE_LABEL,
  STATUS_LABEL,
  toLocalized,
  type ChapterNode,
  type ItemSummary,
  type ItemType,
  type SubjectTree,
  type TopicNode,
} from '@/lib/content';
import { localized, plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DragHandle, dragRowClass, useDragReorder } from '@/lib/drag-reorder';
import { SubjectDialog } from './subject-dialog';

type Level = 'chapter' | 'topic';
const ITEM_ICON: Record<ItemType, LucideIcon> = { note: NotebookPen, pdf: FileText, video: Video };
const STRUCTURAL: PublishStatus[] = ['draft', 'in_review', 'published', 'archived'];

const menuItem =
  'flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-2 text-sm text-text outline-none data-[highlighted]:bg-surface-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

const outlineSchema = z
  .object({
    numberLabel: z.string().trim().max(20),
    titleEn: z.string().trim().max(300),
    titleNe: z.string().trim().max(300),
    descEn: z.string().trim().max(2000),
    descNe: z.string().trim().max(2000),
    estimatedMinutes: z
      .string()
      .trim()
      .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 100_000), {
        message: 'Enter whole minutes',
      }),
  })
  .refine((v) => v.titleEn || v.titleNe, {
    path: ['titleEn'],
    message: 'Enter the title in English, Nepali or both',
  });
type OutlineValues = z.infer<typeof outlineSchema>;

/** Create/edit dialog for chapters and topics (same fields). */
function OutlineDialog({
  level,
  node,
  parentId,
  onClose,
}: {
  level: Level;
  node: TopicNode | ChapterNode | null;
  parentId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<OutlineValues>({
    resolver: zodResolver(outlineSchema),
    defaultValues: {
      numberLabel: node?.numberLabel ?? '',
      titleEn: node?.title.en ?? '',
      titleNe: node?.title.ne ?? '',
      descEn: node?.description?.en ?? '',
      descNe: node?.description?.ne ?? '',
      estimatedMinutes: node?.estimatedMinutes?.toString() ?? '',
    },
  });
  const errors = form.formState.errors;
  const word = level === 'chapter' ? 'chapter' : 'topic';
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    const body = {
      numberLabel: v.numberLabel || null,
      title: toLocalized(v.titleEn, v.titleNe),
      description: toLocalized(v.descEn, v.descNe),
      estimatedMinutes: v.estimatedMinutes ? Number(v.estimatedMinutes) : null,
    };
    try {
      if (node) await api.put(`/admin/${word}s/${node.id}`, body);
      else if (level === 'chapter') await api.post(`/admin/subjects/${parentId}/chapters`, body);
      else await api.post(`/admin/chapters/${parentId}/topics`, body);
      await qc.invalidateQueries({ queryKey: ['subject-tree'] });
      toast.success(
        node
          ? `${level === 'chapter' ? 'Chapter' : 'Topic'} updated`
          : `${level === 'chapter' ? 'Chapter' : 'Topic'} added`,
      );
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
      title={node ? `Edit ${word}` : `Add a ${word}`}
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
        <div className="grid gap-4 sm:grid-cols-[120px_1fr_1fr]">
          <Field label="Number" hint={level === 'chapter' ? 'e.g. 1' : 'e.g. 1.2'}>
            {(a) => <Input {...a} {...form.register('numberLabel')} />}
          </Field>
          <Field label="Title (English)" error={errors.titleEn?.message}>
            {(a) => <Input {...a} {...form.register('titleEn')} />}
          </Field>
          <Field label="शीर्षक (नेपाली)">
            {(a) => <Input {...a} lang="ne" {...form.register('titleNe')} />}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Description (English)">
            {(a) => <Textarea {...a} {...form.register('descEn')} />}
          </Field>
          <Field label="विवरण (नेपाली)">
            {(a) => <Textarea {...a} lang="ne" {...form.register('descNe')} />}
          </Field>
        </div>
        <Field
          label="Estimated study time (minutes)"
          error={errors.estimatedMinutes?.message}
          className="sm:max-w-60"
        >
          {(a) => <Input {...a} inputMode="numeric" {...form.register('estimatedMinutes')} />}
        </Field>
      </form>
    </Dialog>
  );
}

function ActionsMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={label}>
          <MoreHorizontal />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-52 rounded-md border border-border bg-surface-raised p-1 shadow-e2"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const Separator = () => <DropdownMenu.Separator className="my-1 h-px bg-border" />;

export function SubjectPage() {
  const { subjectId } = useParams({ from: '/app/subjects/$subjectId' });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = useAuth();
  const canPublish = can('content:publish');
  const tree = useQuery({
    queryKey: ['subject-tree', subjectId],
    queryFn: () => api.get<SubjectTree>(`/admin/subjects/${subjectId}/tree`),
  });
  const [editingSubject, setEditingSubject] = useState(false);
  const [outline, setOutline] = useState<{
    level: Level;
    node: ChapterNode | TopicNode | null;
    parentId: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<{ path: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const bind = useDragReorder();

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['subject-tree', subjectId] });
      await qc.invalidateQueries({ queryKey: ['subjects'] });
      toast.success(success);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const statusOptions = STRUCTURAL.filter((s) => canPublish || s === 'draft' || s === 'in_review');
  const saveOrder = (path: string) => (next: string[]) =>
    void run(() => api.put(path, { ids: next }), 'Order saved');
  const reorder = (path: string, ids: string[], index: number, delta: -1 | 1) => {
    const next = [...ids];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target] as string, next[index] as string];
    void run(() => api.put(path, { ids: next }), 'Order saved');
  };

  const statusItems = (path: string, current: PublishStatus) =>
    statusOptions
      .filter((s) => s !== current)
      .map((s) => (
        <DropdownMenu.Item
          key={s}
          className={menuItem}
          onSelect={() => void run(() => api.put(path, { status: s }), `Status: ${STATUS_LABEL[s]}`)}
        >
          {s === 'in_review'
            ? 'Submit for review'
            : s === 'published'
              ? 'Publish'
              : `Move to ${STATUS_LABEL[s].toLowerCase()}`}
        </DropdownMenu.Item>
      ));

  const moveItems = (path: string, ids: string[], index: number) => (
    <>
      <DropdownMenu.Item
        className={menuItem}
        disabled={index === 0}
        onSelect={() => reorder(path, ids, index, -1)}
      >
        <ArrowUp className="size-4" /> Move up
      </DropdownMenu.Item>
      <DropdownMenu.Item
        className={menuItem}
        disabled={index === ids.length - 1}
        onSelect={() => reorder(path, ids, index, 1)}
      >
        <ArrowDown className="size-4" /> Move down
      </DropdownMenu.Item>
    </>
  );

  const newItem = (topicId: string, type: ItemType) =>
    void navigate({ to: '/topics/$topicId/new', params: { topicId }, search: { type, subjectId } });

  if (tree.isPending) return <Spinner />;
  if (tree.isError) return <ErrorState error={tree.error} onRetry={() => void tree.refetch()} />;
  const subject = tree.data;
  const chapterIds = subject.chapters.map((c) => c.id);

  const itemRow = (item: ItemSummary, topic: TopicNode, index: number) => {
    const Icon = ITEM_ICON[item.type];
    const ids = topic.items.map((i) => i.id);
    return (
      <li
        key={item.id}
        className={cn('flex items-start gap-3 py-2 pl-2 pr-1 sm:items-center', dragRowClass)}
        {...bind(
          `items-${topic.id}`,
          ids,
          item.id,
          saveOrder(`/admin/topics/${topic.id}/items/order`),
          !busy,
        )}
      >
        {ids.length > 1 ? <DragHandle className="mt-2 sm:mt-0" /> : null}
        <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-surface-muted text-text-secondary">
          <Icon className="size-4" aria-label={ITEM_TYPE_LABEL[item.type]} />
        </span>
        {/* Title on its own line on phones; badges move below it so neither gets squeezed. */}
        <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
          <Link
            to="/learning-items/$itemId"
            params={{ itemId: item.id }}
            search={{ subjectId }}
            className="block min-w-0 text-sm font-medium text-text hover:text-link sm:flex-1 sm:truncate"
          >
            {localized(item.title)}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:mt-0 sm:shrink-0">
            {item.durationSeconds ? (
              <span className="text-xs text-text-muted">{formatDuration(item.durationSeconds)}</span>
            ) : null}
            {item.accessLevel === 'premium' ? <Badge tone="premium">Premium</Badge> : <Badge>Free</Badge>}
            <StatusBadge status={item.status} publishAt={item.publishAt} />
          </div>
        </div>
        <ActionsMenu label={`Actions for ${localized(item.title)}`}>
          <DropdownMenu.Item
            className={menuItem}
            onSelect={() =>
              void navigate({
                to: '/learning-items/$itemId',
                params: { itemId: item.id },
                search: { subjectId },
              })
            }
          >
            <Pencil className="size-4" /> Open editor
          </DropdownMenu.Item>
          <Separator />
          {moveItems(`/admin/topics/${topic.id}/items/order`, ids, index)}
          {canPublish ? (
            <>
              <Separator />
              <DropdownMenu.Item
                className={cn(menuItem, 'text-danger')}
                onSelect={() =>
                  setDeleting({ path: `/admin/learning-items/${item.id}`, label: localized(item.title) })
                }
              >
                <Trash2 className="size-4" /> Delete
              </DropdownMenu.Item>
            </>
          ) : null}
        </ActionsMenu>
      </li>
    );
  };

  const topicBlock = (topic: TopicNode, chapter: ChapterNode, index: number) => (
    <li
      key={topic.id}
      className={cn('rounded-sm border border-border', dragRowClass)}
      {...bind(
        `topics-${chapter.id}`,
        chapter.topics.map((t) => t.id),
        topic.id,
        saveOrder(`/admin/chapters/${chapter.id}/topics/order`),
        !busy,
      )}
    >
      <div className="flex items-center gap-3 border-b border-border bg-surface-muted/40 px-3 py-2">
        {chapter.topics.length > 1 ? <DragHandle /> : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">
            {topic.numberLabel ? <span className="mr-1.5 text-text-muted">{topic.numberLabel}</span> : null}
            {localized(topic.title)}
          </p>
          <p className="text-xs text-text-muted">{plural(topic.items.length, 'item')}</p>
        </div>
        <StatusBadge status={topic.status} />
        <ActionsMenu label={`Actions for topic ${localized(topic.title)}`}>
          {(['note', 'pdf', 'video'] as const).map((t) => (
            <DropdownMenu.Item key={t} className={menuItem} onSelect={() => newItem(topic.id, t)}>
              <Plus className="size-4" /> Add {ITEM_TYPE_LABEL[t].toLowerCase()}
            </DropdownMenu.Item>
          ))}
          <Separator />
          <DropdownMenu.Item
            className={menuItem}
            onSelect={() => setOutline({ level: 'topic', node: topic, parentId: chapter.id })}
          >
            <Pencil className="size-4" /> Edit topic
          </DropdownMenu.Item>
          {statusItems(`/admin/topics/${topic.id}/status`, topic.status)}
          <Separator />
          {moveItems(
            `/admin/chapters/${chapter.id}/topics/order`,
            chapter.topics.map((t) => t.id),
            index,
          )}
          {canPublish ? (
            <>
              <Separator />
              <DropdownMenu.Item
                className={cn(menuItem, 'text-danger')}
                onSelect={() =>
                  setDeleting({ path: `/admin/topics/${topic.id}`, label: localized(topic.title) })
                }
              >
                <Trash2 className="size-4" /> Delete topic
              </DropdownMenu.Item>
            </>
          ) : null}
        </ActionsMenu>
      </div>
      {topic.items.length ? (
        <ul className="divide-y divide-border px-2">
          {topic.items.map((item, i) => itemRow(item, topic, i))}
        </ul>
      ) : (
        <div className="flex flex-wrap items-center gap-2 px-3 py-3 text-sm text-text-muted">
          No material yet.
          {(['note', 'pdf', 'video'] as const).map((t) => (
            <Button key={t} variant="soft" size="sm" onClick={() => newItem(topic.id, t)}>
              <Plus /> {ITEM_TYPE_LABEL[t]}
            </Button>
          ))}
        </div>
      )}
    </li>
  );

  return (
    <>
      <Link
        to="/subjects"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" /> Subjects
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {subject.iconUrl ? (
            <img src={subject.iconUrl} alt="" className="size-14 rounded-md object-cover" />
          ) : null}
          <div>
            <h1 className="text-[26px] font-bold leading-8 tracking-tight text-text">
              {subject.name.en ?? subject.name.ne}
            </h1>
            {subject.name.en && subject.name.ne ? (
              <p className="text-text-secondary" lang="ne">
                {subject.name.ne}
              </p>
            ) : null}
          </div>
          <StatusBadge status={subject.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Subject status"
            value={subject.status}
            disabled={busy}
            onChange={(e) =>
              void run(
                () => api.put(`/admin/subjects/${subject.id}/status`, { status: e.target.value }),
                'Status updated',
              )
            }
            className="w-auto"
          >
            {STRUCTURAL.map((s) => (
              <option key={s} value={s} disabled={!statusOptions.includes(s)}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => setEditingSubject(true)}>
            <Pencil /> Edit details
          </Button>
          <Button onClick={() => setOutline({ level: 'chapter', node: null, parentId: subject.id })}>
            <Plus /> Add chapter
          </Button>
        </div>
      </div>
      {!canPublish ? (
        <div className="mb-4">
          <Alert tone="primary" title="You can draft and submit for review">
            Someone with publishing rights makes content live. Published content can only be changed by them.
          </Alert>
        </div>
      ) : null}
      {subject.chapters.length === 0 ? (
        <Card>
          <EmptyState
            title="No chapters yet"
            description="Add the first chapter, then topics inside it, then notes, PDFs and videos inside topics."
            action={
              <Button onClick={() => setOutline({ level: 'chapter', node: null, parentId: subject.id })}>
                <Plus /> Add the first chapter
              </Button>
            }
          />
        </Card>
      ) : (
        <ol className="flex flex-col gap-4">
          {subject.chapters.map((chapter, ci) => (
            <li
              key={chapter.id}
              className={cn('rounded-lg', dragRowClass)}
              {...bind(
                'chapters',
                chapterIds,
                chapter.id,
                saveOrder(`/admin/subjects/${subject.id}/chapters/order`),
                !busy,
              )}
            >
              <Card>
                <div className="flex items-center gap-3 border-b border-border px-5 py-3">
                  {chapterIds.length > 1 ? <DragHandle /> : null}
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[17px] font-semibold text-text">
                      {chapter.numberLabel ? (
                        <span className="mr-2 text-text-muted">{chapter.numberLabel}</span>
                      ) : null}
                      {localized(chapter.title)}
                    </h2>
                    <p className="text-xs text-text-muted">
                      {plural(chapter.topics.length, 'topic')}
                      {chapter.estimatedMinutes ? ` · about ${chapter.estimatedMinutes} min` : ''}
                    </p>
                  </div>
                  <StatusBadge status={chapter.status} />
                  <ActionsMenu label={`Actions for chapter ${localized(chapter.title)}`}>
                    <DropdownMenu.Item
                      className={menuItem}
                      onSelect={() => setOutline({ level: 'topic', node: null, parentId: chapter.id })}
                    >
                      <Plus className="size-4" /> Add topic
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={menuItem}
                      onSelect={() => setOutline({ level: 'chapter', node: chapter, parentId: subject.id })}
                    >
                      <Pencil className="size-4" /> Edit chapter
                    </DropdownMenu.Item>
                    {statusItems(`/admin/chapters/${chapter.id}/status`, chapter.status)}
                    <Separator />
                    {moveItems(`/admin/subjects/${subject.id}/chapters/order`, chapterIds, ci)}
                    {canPublish ? (
                      <>
                        <Separator />
                        <DropdownMenu.Item
                          className={cn(menuItem, 'text-danger')}
                          onSelect={() =>
                            setDeleting({
                              path: `/admin/chapters/${chapter.id}`,
                              label: localized(chapter.title),
                            })
                          }
                        >
                          <Trash2 className="size-4" /> Delete chapter
                        </DropdownMenu.Item>
                      </>
                    ) : null}
                  </ActionsMenu>
                </div>
                <div className="p-4">
                  {chapter.topics.length ? (
                    <ol className="flex flex-col gap-3">
                      {chapter.topics.map((t, ti) => topicBlock(t, chapter, ti))}
                    </ol>
                  ) : (
                    <p className="text-sm text-text-muted">
                      No topics yet.{' '}
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => setOutline({ level: 'topic', node: null, parentId: chapter.id })}
                      >
                        Add a topic
                      </Button>
                    </p>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}

      {editingSubject ? <SubjectDialog subject={subject} onClose={() => setEditingSubject(false)} /> : null}
      {outline ? (
        <OutlineDialog
          level={outline.level}
          node={outline.node}
          parentId={outline.parentId}
          onClose={() => setOutline(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Delete “${deleting.label}”?`}
          description="It disappears from courses and the app. Anything inside it must be deleted or moved first."
          confirmLabel="Delete"
          onConfirm={async () => {
            await api.delete(deleting.path);
            await qc.invalidateQueries({ queryKey: ['subject-tree', subjectId] });
            toast.success('Deleted');
          }}
        />
      ) : null}
    </>
  );
}
