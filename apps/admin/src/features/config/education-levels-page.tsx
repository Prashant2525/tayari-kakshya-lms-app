import { zodResolver } from '@hookform/resolvers/zod';
import type { LocalizedText } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  Switch,
} from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';

interface Level {
  id: string;
  name: LocalizedText;
  active: boolean;
  sortOrder: number;
  userCount: number;
}

const schema = z
  .object({ en: z.string().trim().max(80), ne: z.string().trim().max(80), active: z.boolean() })
  .refine((v) => v.en || v.ne, { path: ['en'], message: 'Enter the name in English, Nepali or both' });
type FormValues = z.infer<typeof schema>;

function LevelDialog({ level, onClose }: { level: Level | 'new'; onClose: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const existing = level === 'new' ? null : level;
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      en: existing?.name.en ?? '',
      ne: existing?.name.ne ?? '',
      active: existing?.active ?? true,
    },
  });
  const onSubmit = form.handleSubmit(async ({ en, ne, active }) => {
    setError(null);
    const body = { name: { ...(en ? { en } : {}), ...(ne ? { ne } : {}) }, active };
    try {
      if (existing) await api.put(`/admin/education-levels/${existing.id}`, body);
      else await api.post('/admin/education-levels', body);
      await qc.invalidateQueries({ queryKey: ['education-levels'] });
      toast.success(existing ? 'Education level updated' : 'Education level added');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={existing ? 'Edit education level' : 'Add education level'}
      description="Students pick this on their profile. Provide both languages when you can."
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
        <Field label="Name (English)" error={form.formState.errors.en?.message}>
          {(a) => <Input {...a} {...form.register('en')} placeholder="e.g. Bachelor's degree" />}
        </Field>
        <Field label="नाम (नेपाली)">
          {(a) => <Input {...a} {...form.register('ne')} lang="ne" placeholder="जस्तै: स्नातक" />}
        </Field>
        <Controller
          control={form.control}
          name="active"
          render={({ field }) => (
            <div className="flex items-center justify-between rounded-sm border border-border p-3">
              <div>
                <p className="text-sm font-semibold text-text">Visible to students</p>
                <p className="text-xs text-text-muted">
                  Inactive levels stay on existing profiles but cannot be chosen.
                </p>
              </div>
              <Switch checked={field.value} onCheckedChange={field.onChange} label="Visible to students" />
            </div>
          )}
        />
      </form>
    </Dialog>
  );
}

export function EducationLevelsPage() {
  const qc = useQueryClient();
  const levels = useQuery({
    queryKey: ['education-levels'],
    queryFn: () => api.get<Level[]>('/admin/education-levels'),
  });
  const [editing, setEditing] = useState<Level | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Level | null>(null);
  const [moving, setMoving] = useState(false);

  const move = async (index: number, delta: -1 | 1) => {
    if (!levels.data) return;
    const ids = levels.data.map((l) => l.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    setMoving(true);
    try {
      qc.setQueryData(['education-levels'], await api.put<Level[]>('/admin/education-levels/order', { ids }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setMoving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Education levels"
        description="Options for the “education level” field on student profiles, in the order students see them."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> Add level
          </Button>
        }
      />
      <Card>
        {levels.isPending ? (
          <Spinner />
        ) : levels.isError ? (
          <ErrorState error={levels.error} onRetry={() => void levels.refetch()} />
        ) : levels.data.length === 0 ? (
          <EmptyState
            title="No education levels yet"
            description="Add the options students can choose from, for example SEE, +2, Bachelor and Master."
            action={
              <Button onClick={() => setEditing('new')}>
                <Plus /> Add the first level
              </Button>
            }
          />
        ) : (
          <ol className="divide-y divide-border">
            {levels.data.map((level, index) => (
              <li key={level.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Move up"
                    disabled={index === 0 || moving}
                    onClick={() => void move(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Move down"
                    disabled={index === levels.data.length - 1 || moving}
                    onClick={() => void move(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-text">
                    {level.name.en ?? <span className="text-text-muted">No English name</span>}
                  </p>
                  <p className="text-sm text-text-secondary" lang="ne">
                    {level.name.ne ?? <span className="text-text-muted">नेपाली नाम छैन</span>}
                  </p>
                </div>
                {!level.active ? <Badge>Hidden</Badge> : null}
                <span className="hidden text-xs text-text-muted sm:inline">{level.userCount} students</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${level.name.en ?? level.name.ne}`}
                  onClick={() => setEditing(level)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${level.name.en ?? level.name.ne}`}
                  onClick={() => setDeleting(level)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {editing ? <LevelDialog level={editing} onClose={() => setEditing(null)} /> : null}
      {deleting ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title="Delete this education level?"
          description={
            deleting.userCount > 0
              ? `${deleting.userCount} students use it, so it cannot be deleted. Hide it instead by editing it.`
              : 'It will no longer be available to students.'
          }
          confirmLabel="Delete"
          onConfirm={async () => {
            await api.delete(`/admin/education-levels/${deleting.id}`);
            await qc.invalidateQueries({ queryKey: ['education-levels'] });
            toast.success('Education level deleted');
          }}
        />
      ) : null}
    </>
  );
}
