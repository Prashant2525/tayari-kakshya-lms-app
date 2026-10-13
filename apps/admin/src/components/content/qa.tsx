import type { LocalizedText } from '@tk/contracts';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Eye, FileText, Lock, PlayCircle, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { RichTextView } from '@/components/content/rich-text-editor';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Card, CardHeader, ErrorState, Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { formatDuration, type LearningItemAdmin } from '@/lib/content';
import type { JsonNode } from '@/lib/rich-doc';
import { cn } from '@/lib/utils';

type Lang = 'en' | 'ne';
type LocalizedDoc = Partial<Record<Lang, JsonNode>>;

interface Checklist {
  ready: boolean;
  checks: Array<{ key: string; ok: boolean; required: boolean; label: string }>;
}

const pickText = (t: LocalizedText | null | undefined, l: Lang) => t?.[l] ?? t?.en ?? t?.ne ?? '';
const pickDoc = (d: LocalizedDoc | null | undefined, l: Lang) => d?.[l] ?? d?.en ?? d?.ne ?? null;

/**
 * "Before publishing" (S23, D-075 / audit F-04): what the server finds missing. Required lines stop students from
 * using the content; the others are recommended. `version` refetches it after each save.
 */
export function ChecklistCard({ url, version }: { url: string; version: string }) {
  const list = useQuery({ queryKey: ['qa-checklist', url, version], queryFn: () => api.get<Checklist>(url) });
  return (
    <Card role="region" aria-label="Before publishing">
      <CardHeader
        title="Before publishing"
        description={
          list.data ? (
            list.data.ready ? (
              <span className="inline-flex items-center gap-1.5 text-success">
                <CheckCircle2 className="size-4" /> Students can use it
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-warning">
                <TriangleAlert className="size-4" /> Something students need is missing
              </span>
            )
          ) : undefined
        }
      />
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <ul className="flex flex-col gap-2 p-5 text-sm">
          {list.data.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2">
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Done" />
              ) : c.required ? (
                <TriangleAlert
                  className="mt-0.5 size-4 shrink-0 text-danger"
                  aria-label="Missing (required)"
                />
              ) : (
                <Circle
                  className="mt-0.5 size-4 shrink-0 text-text-muted"
                  aria-label="Missing (recommended)"
                />
              )}
              <span className={cn(c.ok ? 'text-text-secondary' : c.required ? 'text-danger' : 'text-text')}>
                {c.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** A phone-width frame with the language switch, like the app. */
function PhoneFrame({
  lang,
  setLang,
  children,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-1" role="tablist" aria-label="App language">
        {(
          [
            ['en', 'English'],
            ['ne', 'नेपाली'],
          ] as const
        ).map(([l, label]) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={lang === l}
            onClick={() => setLang(l)}
            className={cn(
              'rounded-sm px-3 py-1 text-sm',
              lang === l
                ? 'bg-primary-soft font-semibold text-on-primary-soft'
                : 'text-text-muted hover:text-text',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        lang={lang}
        className="w-full max-w-[380px] overflow-y-auto rounded-[28px] border-[6px] border-text/80 bg-surface p-4 shadow-e2"
        style={{ maxHeight: '62vh' }}
      >
        {children}
      </div>
    </div>
  );
}

/** "Preview as student" for a lesson: as a student with access sees it, and as one without access. */
export function ItemPreviewButton({ item }: { item: LearningItemAdmin }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>('en');
  const [locked, setLocked] = useState(false);
  const premium = item.accessLevel === 'premium';
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Eye /> Preview as student
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title="Preview as student"
        description="The saved version, as the app shows it. Save your changes first to see them here."
      >
        {premium ? (
          <div className="mb-3 flex justify-center gap-1" role="tablist" aria-label="Student">
            {(
              [
                [false, 'With access'],
                [true, 'Without access'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={locked === value}
                onClick={() => setLocked(value)}
                className={cn(
                  'rounded-sm px-3 py-1 text-sm',
                  locked === value
                    ? 'bg-primary-soft font-semibold text-on-primary-soft'
                    : 'text-text-muted hover:text-text',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <PhoneFrame lang={lang} setLang={setLang}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {premium ? <Badge tone="premium">Premium</Badge> : <Badge tone="success">Free</Badge>}
            {item.durationSeconds ? (
              <span className="text-xs text-text-muted">{formatDuration(item.durationSeconds)}</span>
            ) : null}
          </div>
          <h2 className="mb-3 text-xl font-bold text-text">{pickText(item.title, lang)}</h2>
          {premium && locked ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-border p-6 text-center">
              <Lock className="size-6 text-text-muted" aria-hidden />
              <p className="font-semibold text-text">Premium lesson</p>
              <p className="text-sm text-text-secondary">
                Students without access see the title only; the lesson is not sent to their app.
              </p>
            </div>
          ) : item.type === 'note' ? (
            pickDoc(item.noteContent as LocalizedDoc | null, lang) ? (
              <RichTextView
                value={pickDoc(item.noteContent as LocalizedDoc | null, lang)}
                lang={lang}
                label="Note as students see it"
              />
            ) : (
              <p className="text-sm text-danger">This note has no text yet.</p>
            )
          ) : item.type === 'pdf' ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-border p-6 text-center">
              <FileText className="size-6 text-text-muted" aria-hidden />
              <p className="font-semibold text-text">
                {item.pdf ? `${item.pdf.pageCount ?? '?'} pages` : 'No PDF attached yet'}
              </p>
              <p className="text-sm text-text-secondary">
                Opens in the app's reader with the student's name on every page
                {item.downloadable ? '; it can also be downloaded.' : '.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-md border border-border p-6 text-center">
              {item.video?.thumbnailUrl ? (
                <img src={item.video.thumbnailUrl} alt="" className="w-full rounded-sm" />
              ) : (
                <PlayCircle className="size-6 text-text-muted" aria-hidden />
              )}
              <p className="text-sm text-text-secondary">
                {!item.video
                  ? 'No video linked yet.'
                  : item.video.status === 'ready'
                    ? 'Plays in the app.'
                    : 'Still processing — students see "try again later".'}
              </p>
            </div>
          )}
        </PhoneFrame>
      </Dialog>
    </>
  );
}

type PreviewQuestion =
  | {
      type: 'single_choice' | 'multiple_choice';
      stem: LocalizedDoc;
      options: Array<{ id: string; content: LocalizedDoc }>;
    }
  | { type: 'true_false' | 'subjective'; stem: LocalizedDoc }
  | { type: 'fill_blank'; stem: LocalizedDoc; blanks: Array<{ id: string }> }
  | {
      type: 'match';
      stem: LocalizedDoc;
      left: Array<{ id: string; content: LocalizedDoc }>;
      right: Array<{ id: string; content: LocalizedDoc }>;
    }
  | { type: 'numeric'; stem: LocalizedDoc; unit: LocalizedText | null };

interface AssessmentPreview {
  title: LocalizedText;
  instructions: LocalizedDoc | null;
  accessLevel: 'free' | 'premium';
  durationMinutes: number | null;
  totalMarks: { min: number; max: number };
  sections: Array<{
    id: string;
    title: LocalizedText | null;
    pickMode: 'fixed' | 'random';
    questionCount: number | null;
    questions: Array<{ number: number; questionId: string; marks: number; question: PreviewQuestion }>;
  }>;
}

const letter = (i: number) => String.fromCharCode(65 + i);

function QuestionPreview({
  q,
  lang,
  number,
  marks,
}: {
  q: PreviewQuestion;
  lang: Lang;
  number: number;
  marks: number;
}) {
  return (
    <article
      aria-label={`Question ${number}`}
      className="flex flex-col gap-2 rounded-md border border-border p-3"
    >
      <p className="text-xs font-semibold text-text-muted">
        Question {number} · {marks} mark{marks === 1 ? '' : 's'}
      </p>
      <RichTextView value={pickDoc(q.stem, lang)} lang={lang} label={`Question ${number}`} />
      {q.type === 'single_choice' || q.type === 'multiple_choice' ? (
        <ul className="flex flex-col gap-1.5">
          {q.options.map((o, i) => (
            <li key={o.id} className="flex items-start gap-2 rounded-sm border border-border px-2 py-1.5">
              <span className="w-4 text-sm font-semibold text-text-muted">{letter(i)}</span>
              <div className="min-w-0 flex-1">
                <RichTextView value={pickDoc(o.content, lang)} lang={lang} label={`Option ${letter(i)}`} />
              </div>
            </li>
          ))}
        </ul>
      ) : q.type === 'true_false' ? (
        <p className="text-sm text-text-secondary">True · False</p>
      ) : q.type === 'fill_blank' ? (
        <p className="text-sm text-text-secondary">
          {q.blanks.length} blank{q.blanks.length === 1 ? '' : 's'} to fill
        </p>
      ) : q.type === 'match' ? (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <ul className="flex flex-col gap-1">
            {q.left.map((x, i) => (
              <li key={x.id} className="rounded-sm border border-border px-2 py-1">
                <RichTextView value={pickDoc(x.content, lang)} lang={lang} label={`Left ${i + 1}`} />
              </li>
            ))}
          </ul>
          <ul className="flex flex-col gap-1">
            {q.right.map((x, i) => (
              <li key={x.id} className="rounded-sm border border-border px-2 py-1">
                <RichTextView value={pickDoc(x.content, lang)} lang={lang} label={`Right ${i + 1}`} />
              </li>
            ))}
          </ul>
        </div>
      ) : q.type === 'numeric' ? (
        <p className="text-sm text-text-secondary">
          Number answer{q.unit ? ` (${pickText(q.unit, lang)})` : ''}
        </p>
      ) : (
        <p className="text-sm text-text-secondary">Written answer</p>
      )}
    </article>
  );
}

/** "Preview as student" for a test: questions as students get them, without answers or explanations. */
export function AssessmentPreviewButton({
  assessmentId,
  version,
}: {
  assessmentId: string;
  version: string;
}) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>('en');
  const preview = useQuery({
    queryKey: ['assessment-preview', assessmentId, version],
    queryFn: () => api.get<AssessmentPreview>(`/admin/assessments/${assessmentId}/preview`),
    enabled: open,
  });
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Eye /> Preview as student
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title="Preview as student"
        description="The saved questions in order, as students get them (shuffling, if on, changes the order per student). Answers and explanations are not shown."
      >
        {preview.isPending ? (
          <Spinner />
        ) : preview.isError ? (
          <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
        ) : (
          <PhoneFrame lang={lang} setLang={setLang}>
            <h2 className="text-xl font-bold text-text">{pickText(preview.data.title, lang)}</h2>
            <p className="mb-3 text-sm text-text-secondary">
              {[
                preview.data.durationMinutes ? `${preview.data.durationMinutes} minutes` : 'No time limit',
                preview.data.totalMarks.min === preview.data.totalMarks.max
                  ? `${preview.data.totalMarks.min} marks`
                  : `${preview.data.totalMarks.min}–${preview.data.totalMarks.max} marks`,
              ].join(' · ')}
            </p>
            {pickDoc(preview.data.instructions, lang) ? (
              <div className="mb-3 rounded-md bg-surface-muted p-3">
                <RichTextView
                  value={pickDoc(preview.data.instructions, lang)}
                  lang={lang}
                  label="Instructions"
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-4">
              {preview.data.sections.map((s, i) => (
                <section
                  key={s.id}
                  aria-label={pickText(s.title, lang) || `Section ${i + 1}`}
                  className="flex flex-col gap-2"
                >
                  {preview.data.sections.length > 1 || s.title ? (
                    <h3 className="font-semibold text-text">
                      {pickText(s.title, lang) || `Section ${i + 1}`}
                    </h3>
                  ) : null}
                  {s.pickMode === 'random' ? (
                    <p className="rounded-md border border-dashed border-border p-3 text-sm text-text-secondary">
                      {s.questionCount ?? 0} questions drawn at random for each student.
                    </p>
                  ) : (
                    s.questions.map((q) => (
                      <QuestionPreview
                        key={q.questionId}
                        q={q.question}
                        lang={lang}
                        number={q.number}
                        marks={q.marks}
                      />
                    ))
                  )}
                </section>
              ))}
            </div>
          </PhoneFrame>
        )}
      </Dialog>
    </>
  );
}
