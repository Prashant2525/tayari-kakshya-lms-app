import type { LocalizedText } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Alert, Card, CardHeader, EmptyState, ErrorState, Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { toLocalized } from '@/lib/content';
import { formatDateTimeBs, localized } from '@/lib/format';

interface CourseUpdateRow {
  id: string;
  title: LocalizedText;
  message: LocalizedText;
  recipients: number;
  sentBy: string;
  createdAt: string;
}

const EMPTY = { titleEn: '', titleNe: '', messageEn: '', messageNe: '' };

/**
 * "Notify students" (D-060): a message to everyone with access to the course now, in the app and — as each student
 * chose for course updates — by push and email. Sent at once; every send is listed.
 */
export function CourseUpdatesSection({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const [v, setV] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const history = useQuery({
    queryKey: ['course-updates', courseId],
    queryFn: ({ signal }) =>
      api.get<{ students: number; data: CourseUpdateRow[] }>(
        `/admin/courses/${courseId}/updates`,
        undefined,
        signal,
      ),
  });
  const set = (key: keyof typeof EMPTY, value: string) => setV((old) => ({ ...old, [key]: value }));
  const title = toLocalized(v.titleEn, v.titleNe);
  const message = toLocalized(v.messageEn, v.messageNe);
  const students = history.data?.students ?? 0;

  const review = () => {
    if (!title) return setError('Write a title in English or Nepali');
    if (!message) return setError('Write the message in English or Nepali');
    if (students === 0) return setError('No students have access to this course yet');
    setError(null);
    setConfirming(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Notify students"
          description="Tell everyone with access to this course about something new — lessons, tests or a change. It appears in their app, and by push and email unless they turned course updates off."
        />
        <div className="flex flex-col gap-4 p-5">
          {error ? <Alert tone="danger" title={error} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title (English)" hint="Up to 120 characters">
              {(a) => (
                <Input
                  {...a}
                  maxLength={120}
                  value={v.titleEn}
                  onChange={(e) => set('titleEn', e.target.value)}
                />
              )}
            </Field>
            <Field label="शीर्षक (नेपाली)" hint="१२० अक्षरसम्म">
              {(a) => (
                <Input
                  {...a}
                  lang="ne"
                  maxLength={120}
                  value={v.titleNe}
                  onChange={(e) => set('titleNe', e.target.value)}
                />
              )}
            </Field>
            <Field label="Message (English)" hint="Up to 1,000 characters">
              {(a) => (
                <Textarea
                  {...a}
                  rows={4}
                  maxLength={1000}
                  value={v.messageEn}
                  onChange={(e) => set('messageEn', e.target.value)}
                />
              )}
            </Field>
            <Field label="सन्देश (नेपाली)" hint="१,००० अक्षरसम्म">
              {(a) => (
                <Textarea
                  {...a}
                  lang="ne"
                  rows={4}
                  maxLength={1000}
                  value={v.messageNe}
                  onChange={(e) => set('messageNe', e.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={review} disabled={history.isPending}>
              <Send /> Send to students
            </Button>
            <span className="text-sm text-text-muted">
              {history.isPending ? ' ' : `${students} student${students === 1 ? '' : 's'} with access now`}
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Sent updates" />
        {history.isPending ? (
          <Spinner />
        ) : history.isError ? (
          <ErrorState error={history.error} onRetry={() => void history.refetch()} />
        ) : history.data.data.length === 0 ? (
          <EmptyState title="No updates sent yet" description="Updates you send are listed here." />
        ) : (
          <ul className="divide-y divide-border">
            {history.data.data.map((u) => (
              <li key={u.id} className="flex flex-col gap-1 px-5 py-4">
                <p className="font-semibold">{localized(u.title)}</p>
                <p className="whitespace-pre-line text-sm text-text-muted">{localized(u.message)}</p>
                <p className="text-xs text-text-muted">
                  {formatDateTimeBs(u.createdAt)} · {u.sentBy} · {u.recipients} student
                  {u.recipients === 1 ? '' : 's'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {confirming && title && message ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirming(false)}
          title="Send this update?"
          description={`It goes to ${students} student${students === 1 ? '' : 's'} at once and cannot be taken back.`}
          confirmLabel="Send update"
          tone="primary"
          onConfirm={async () => {
            const sent = await api.post<{ recipients: number }>(`/admin/courses/${courseId}/updates`, {
              title,
              message,
            });
            setV(EMPTY);
            await qc.invalidateQueries({ queryKey: ['course-updates', courseId] });
            toast.success(`Update sent to ${sent.recipients} student${sent.recipients === 1 ? '' : 's'}`);
          }}
        />
      ) : null}
    </div>
  );
}
