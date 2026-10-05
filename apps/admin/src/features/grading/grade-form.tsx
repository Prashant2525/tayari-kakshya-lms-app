import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { RichTextView } from '@/components/content/rich-text-editor';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Alert } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { marksText, type LocalizedDoc } from '@/lib/grading';
import type { JsonNode } from '@/lib/rich-doc';

/** The model answer next to the student's written answer, with marks (0 … max) and an optional comment. */
export function WrittenAnswer({
  attemptId,
  questionId,
  max,
  modelAnswer,
  text,
  initialMarks,
  initialComment,
  onSaved,
}: {
  attemptId: string;
  questionId: string;
  max: number;
  modelAnswer: LocalizedDoc | undefined;
  text: string;
  initialMarks?: number | null;
  initialComment?: string | null;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const [awarded, setAwarded] = useState(
    initialMarks === null || initialMarks === undefined ? '' : String(initialMarks / 100),
  );
  const [comment, setComment] = useState(initialComment ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const model = (modelAnswer?.en ?? modelAnswer?.ne ?? null) as JsonNode | null;

  const save = async () => {
    const value = Number(awarded);
    if (awarded.trim() === '' || !Number.isFinite(value) || value < 0 || value * 100 > max) {
      setError(`Enter marks from 0 to ${marksText(max)}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.put(`/admin/attempts/${attemptId}/answers/${questionId}/grade`, {
        awarded: value,
        comment: comment.trim() || null,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['grading'] }),
        qc.invalidateQueries({ queryKey: ['attempt', attemptId] }),
        qc.invalidateQueries({ queryKey: ['assessment-results'] }),
      ]);
      toast.success('Marks saved');
      onSaved?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-sm border border-border bg-surface-muted p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Model answer</p>
        {model ? <RichTextView value={model} label="Model answer" /> : <p className="text-sm">—</p>}
      </div>
      <div className="rounded-sm border border-border p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Student's answer</p>
        <p className="whitespace-pre-wrap text-sm text-text">{text || '—'}</p>
      </div>
      <div className="flex flex-col gap-3 lg:col-span-2 sm:flex-row sm:items-start">
        <Field label={`Marks (out of ${marksText(max)})`} className="sm:w-48">
          {(a) => (
            <Input {...a} inputMode="decimal" value={awarded} onChange={(e) => setAwarded(e.target.value)} />
          )}
        </Field>
        <Field label="Comment for the student" hint="Optional." className="flex-1">
          {(a) => <Textarea {...a} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />}
        </Field>
      </div>
      {error ? (
        <div className="lg:col-span-2">
          <Alert tone="danger" title={error} />
        </div>
      ) : null}
      <div className="lg:col-span-2">
        <Button size="sm" loading={saving} onClick={() => void save()}>
          Save marks
        </Button>
      </div>
    </div>
  );
}
