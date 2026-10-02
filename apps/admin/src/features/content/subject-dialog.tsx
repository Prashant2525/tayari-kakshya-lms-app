import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { MediaField } from '@/components/content/media-picker';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Alert } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { toLocalized, type SubjectTree } from '@/lib/content';

const schema = z
  .object({
    nameEn: z.string().trim().max(200),
    nameNe: z.string().trim().max(200),
    summaryEn: z.string().trim().max(1000),
    summaryNe: z.string().trim().max(1000),
    iconMediaId: z.string().nullable(),
  })
  .refine((v) => v.nameEn || v.nameNe, {
    path: ['nameEn'],
    message: 'Enter the name in English, Nepali or both',
  });
type FormValues = z.infer<typeof schema>;

/** Create or edit a subject (a reusable block of chapters that courses include). */
export function SubjectDialog({
  subject,
  onClose,
  onCreated,
}: {
  subject: Pick<SubjectTree, 'id' | 'name' | 'summary' | 'iconMediaId'> | null;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nameEn: subject?.name.en ?? '',
      nameNe: subject?.name.ne ?? '',
      summaryEn: subject?.summary?.en ?? '',
      summaryNe: subject?.summary?.ne ?? '',
      iconMediaId: subject?.iconMediaId ?? null,
    },
  });
  const errors = form.formState.errors;
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    const body = {
      name: toLocalized(v.nameEn, v.nameNe),
      summary: toLocalized(v.summaryEn, v.summaryNe),
      iconMediaId: v.iconMediaId,
    };
    try {
      if (subject) {
        await api.put(`/admin/subjects/${subject.id}`, body);
        toast.success('Subject updated');
      } else {
        const created = await api.post<{ id: string }>('/admin/subjects', body);
        toast.success('Subject added');
        onCreated?.(created.id);
      }
      await qc.invalidateQueries({ queryKey: ['subjects'] });
      await qc.invalidateQueries({ queryKey: ['subject-tree'] });
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
      title={subject ? 'Edit subject' : 'Add a subject'}
      description="A subject (for example “General Knowledge”) can be reused by several courses."
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
            {(a) => <Input {...a} {...form.register('nameEn')} placeholder="e.g. General Knowledge" />}
          </Field>
          <Field label="नाम (नेपाली)">
            {(a) => (
              <Input {...a} lang="ne" {...form.register('nameNe')} placeholder="जस्तै: सामान्य ज्ञान" />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Summary (English)">
            {(a) => <Textarea {...a} {...form.register('summaryEn')} />}
          </Field>
          <Field label="सारांश (नेपाली)">
            {(a) => <Textarea {...a} lang="ne" {...form.register('summaryNe')} />}
          </Field>
        </div>
        <Controller
          control={form.control}
          name="iconMediaId"
          render={({ field }) => (
            <MediaField kind="image" label="Subject icon" value={field.value} onChange={field.onChange} />
          )}
        />
      </form>
    </Dialog>
  );
}
