import type { QuestionType } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/content/status';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Badge, Card, CardHeader, Checkbox, Spinner, Switch } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import type { AssessmentDetail, PoolFilter, SectionQuestion } from '@/lib/assessments';
import type { CursorPage, SubjectRow, SubjectTree } from '@/lib/content';
import { localized } from '@/lib/format';
import { QUESTION_TYPE_LABEL, type QuestionRow } from '@/lib/questions';

interface SectionDraft {
  key: string;
  title: string;
  pickMode: 'fixed' | 'random';
  questions: Array<
    Pick<SectionQuestion, 'questionId' | 'type' | 'status' | 'preview' | 'defaultMarks'> & {
      marks: string;
      negativeMarks: string;
    }
  >;
  filter: {
    subjectId: string;
    chapterId: string;
    topicId: string;
    difficulty: string;
    types: QuestionType[];
    tags: string;
    pyqOnly: boolean;
  };
  questionCount: string;
  marksPerQuestion: string;
  negativeMarksPerQuestion: string;
}

const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));
let seq = 0;
const newKey = () => `s${(seq += 1)}`;

function fromDetail(a: AssessmentDetail): SectionDraft[] {
  return a.sections.map((s) => ({
    key: newKey(),
    title: s.title?.en ?? s.title?.ne ?? '',
    pickMode: s.pickMode,
    questions: s.questions.map((q) => ({ ...q, marks: str(q.marks), negativeMarks: str(q.negativeMarks) })),
    filter: {
      subjectId: s.filter?.subjectId ?? '',
      chapterId: s.filter?.chapterId ?? '',
      topicId: s.filter?.topicId ?? '',
      difficulty: s.filter?.difficulty ?? '',
      types: s.filter?.types ?? [],
      tags: (s.filter?.tags ?? []).join(', '),
      pyqOnly: s.filter?.pyqOnly ?? false,
    },
    questionCount: str(s.questionCount),
    marksPerQuestion: str(s.marksPerQuestion),
    negativeMarksPerQuestion: str(s.negativeMarksPerQuestion),
  }));
}

function toBody(sections: SectionDraft[]) {
  return {
    sections: sections.map((s) => ({
      title: s.title.trim() ? { en: s.title.trim() } : null,
      pickMode: s.pickMode,
      questions:
        s.pickMode === 'fixed'
          ? s.questions.map((q) => ({
              questionId: q.questionId,
              marks: numOrNull(q.marks),
              negativeMarks: numOrNull(q.negativeMarks),
            }))
          : [],
      filter:
        s.pickMode === 'random'
          ? ({
              subjectId: s.filter.subjectId,
              chapterId: s.filter.chapterId || null,
              topicId: s.filter.topicId || null,
              difficulty: (s.filter.difficulty || null) as PoolFilter['difficulty'],
              types: s.filter.types.length ? s.filter.types : undefined,
              tags: s.filter.tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
              pyqOnly: s.filter.pyqOnly || undefined,
            } satisfies PoolFilter)
          : null,
      questionCount: s.pickMode === 'random' ? numOrNull(s.questionCount) : null,
      marksPerQuestion: numOrNull(s.marksPerQuestion),
      negativeMarksPerQuestion: numOrNull(s.negativeMarksPerQuestion),
    })),
  };
}

/** Pick questions from the bank for a fixed section. */
function QuestionPicker({
  exclude,
  onAdd,
  onClose,
}: {
  exclude: Set<string>;
  onAdd: (rows: QuestionRow[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('published');
  const [picked, setPicked] = useState<Map<string, QuestionRow>>(new Map());
  const subjects = useQuery({
    queryKey: ['subjects', 'all'],
    queryFn: () => api.get<CursorPage<SubjectRow>>('/admin/subjects', { limit: 100 }),
  });
  const list = useQuery({
    queryKey: ['questions', 'picker', { q, subjectId, type, status }],
    queryFn: () =>
      api.get<CursorPage<QuestionRow>>('/admin/questions', { q, subjectId, type, status, limit: 50 }),
  });
  const rows = (list.data?.data ?? []).filter((r) => !exclude.has(r.id));
  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title="Add questions"
      description="Tick questions to add them in this order. Only published questions can go live."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!picked.size} onClick={() => onAdd([...picked.values()])}>
            Add {picked.size || ''} question{picked.size === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <div className="relative sm:col-span-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search question text"
            className="pl-9"
            aria-label="Search questions"
          />
        </div>
        <Select
          aria-label="Subject"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          className="sm:col-span-2"
        >
          <option value="">All subjects</option>
          {(subjects.data?.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {localized(s.name)}
            </option>
          ))}
        </Select>
        <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => (
            <option key={t} value={t}>
              {QUESTION_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="published">Published</option>
          <option value="">Any status</option>
        </Select>
      </div>
      {list.isPending ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">No matching questions.</p>
      ) : (
        <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-sm border border-border">
          {rows.map((r) => {
            const id = `pick-${r.id}`;
            return (
              <li key={r.id} className="flex items-start gap-3 p-3">
                <Checkbox
                  id={id}
                  checked={picked.has(r.id)}
                  onCheckedChange={(on) =>
                    setPicked((m) => {
                      const next = new Map(m);
                      if (on) next.set(r.id, r);
                      else next.delete(r.id);
                      return next;
                    })
                  }
                />
                <label htmlFor={id} className="min-w-0 flex-1 text-sm">
                  <span className="line-clamp-2 text-text">{r.preview || '(image only)'}</span>
                  <span className="text-xs text-text-muted">
                    {QUESTION_TYPE_LABEL[r.type]} · {localized(r.subject)} · {r.defaultMarks} mark
                    {r.defaultMarks === 1 ? '' : 's'}
                  </span>
                </label>
                <StatusBadge status={r.status} />
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

function RandomSection({ s, update }: { s: SectionDraft; update: (patch: Partial<SectionDraft>) => void }) {
  const subjects = useQuery({
    queryKey: ['subjects', 'all'],
    queryFn: () => api.get<CursorPage<SubjectRow>>('/admin/subjects', { limit: 100 }),
  });
  const tree = useQuery({
    queryKey: ['subject-tree', s.filter.subjectId],
    queryFn: () => api.get<SubjectTree>(`/admin/subjects/${s.filter.subjectId}/tree`),
    enabled: Boolean(s.filter.subjectId),
  });
  const chapter = tree.data?.chapters.find((c) => c.id === s.filter.chapterId);
  const f = s.filter;
  const setF = (patch: Partial<SectionDraft['filter']>) => update({ filter: { ...f, ...patch } });
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Subject">
        {(a) => (
          <Select
            {...a}
            value={f.subjectId}
            onChange={(e) => setF({ subjectId: e.target.value, chapterId: '', topicId: '' })}
          >
            <option value="">Choose…</option>
            {(subjects.data?.data ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {localized(x.name)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Chapter">
        {(a) => (
          <Select
            {...a}
            value={f.chapterId}
            disabled={!f.subjectId}
            onChange={(e) => setF({ chapterId: e.target.value, topicId: '' })}
          >
            <option value="">Whole subject</option>
            {(tree.data?.chapters ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {localized(c.title)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Topic">
        {(a) => (
          <Select
            {...a}
            value={f.topicId}
            disabled={!chapter}
            onChange={(e) => setF({ topicId: e.target.value })}
          >
            <option value="">Whole chapter</option>
            {(chapter?.topics ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {localized(t.title)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Difficulty">
        {(a) => (
          <Select {...a} value={f.difficulty} onChange={(e) => setF({ difficulty: e.target.value })}>
            <option value="">Any</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
        )}
      </Field>
      <Field label="Tags" hint="Comma separated; any of them.">
        {(a) => <Input {...a} value={f.tags} onChange={(e) => setF({ tags: e.target.value })} />}
      </Field>
      <Field label="Number of questions">
        {(a) => (
          <Input
            {...a}
            inputMode="numeric"
            value={s.questionCount}
            onChange={(e) => update({ questionCount: e.target.value })}
          />
        )}
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-sm font-semibold text-text">Question types</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => {
            const id = `${s.key}-type-${t}`;
            return (
              <span key={t} className="flex items-center gap-1.5">
                <Checkbox
                  id={id}
                  checked={f.types.includes(t)}
                  onCheckedChange={(on) =>
                    setF({ types: on ? [...f.types, t] : f.types.filter((x) => x !== t) })
                  }
                />
                <label htmlFor={id} className="text-sm text-text">
                  {QUESTION_TYPE_LABEL[t]}
                </label>
              </span>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-text-muted">None ticked = all types.</p>
      </fieldset>
      <label className="flex items-center gap-2 text-sm text-text">
        <Switch
          checked={f.pyqOnly}
          onCheckedChange={(v) => setF({ pyqOnly: v })}
          label="Previous-year questions only"
        />
        Previous-year questions only
      </label>
    </div>
  );
}

export function StructureEditor({
  assessment,
  disabled,
}: {
  assessment: AssessmentDetail;
  disabled: boolean;
}) {
  const qc = useQueryClient();
  const [sections, setSections] = useState<SectionDraft[]>(() => fromDetail(assessment));
  const [picking, setPicking] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (key: string, patch: Partial<SectionDraft>) =>
    setSections((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const move = <T,>(list: T[], i: number, d: -1 | 1) => {
    const next = [...list];
    const j = i + d;
    if (j < 0 || j >= next.length) return list;
    [next[i], next[j]] = [next[j] as T, next[i] as T];
    return next;
  };
  const allFixed = new Set(sections.flatMap((s) => s.questions.map((q) => q.questionId)));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.put<AssessmentDetail>(
        `/admin/assessments/${assessment.id}/structure`,
        toBody(sections),
      );
      qc.setQueryData(['assessment', assessment.id], updated);
      await qc.invalidateQueries({ queryKey: ['assessments'] });
      toast.success('Questions saved');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Sections and questions"
        description="Fixed sections list exact questions. Random sections pick questions from the bank for each attempt."
        actions={
          <Button onClick={() => void save()} loading={saving} disabled={disabled}>
            Save questions
          </Button>
        }
      />
      <div className="flex flex-col gap-4 p-5">
        {error ? <Alert tone="danger" title={error} /> : null}
        {sections.length === 0 ? <p className="text-sm text-text-muted">No sections yet.</p> : null}
        {sections.map((s, i) => (
          <section key={s.key} aria-label={`Section ${i + 1}`} className="rounded-sm border border-border">
            <div className="flex flex-wrap items-end gap-3 border-b border-border bg-surface-muted/40 p-3">
              <p className="pb-2 font-semibold text-text">Section {i + 1}</p>
              <Field label="Section title" className="min-w-48 flex-1">
                {(a) => (
                  <Input
                    {...a}
                    value={s.title}
                    placeholder="e.g. Part A: General awareness"
                    onChange={(e) => update(s.key, { title: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Questions are">
                {(a) => (
                  <Select
                    {...a}
                    value={s.pickMode}
                    onChange={(e) => update(s.key, { pickMode: e.target.value as SectionDraft['pickMode'] })}
                  >
                    <option value="fixed">Chosen by staff</option>
                    <option value="random">Picked at random</option>
                  </Select>
                )}
              </Field>
              <div className="flex gap-1 pb-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move section ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => setSections((l) => move(l, i, -1))}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move section ${i + 1} down`}
                  disabled={i === sections.length - 1}
                  onClick={() => setSections((l) => move(l, i, 1))}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove section ${i + 1}`}
                  onClick={() => setSections((l) => l.filter((x) => x.key !== s.key))}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-3 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Marks per question (section)" hint="Blank = each question's own marks.">
                  {(a) => (
                    <Input
                      {...a}
                      inputMode="decimal"
                      value={s.marksPerQuestion}
                      onChange={(e) => update(s.key, { marksPerQuestion: e.target.value })}
                    />
                  )}
                </Field>
                <Field label="Negative marks per question (section)" hint="Used when negative marking is on.">
                  {(a) => (
                    <Input
                      {...a}
                      inputMode="decimal"
                      value={s.negativeMarksPerQuestion}
                      onChange={(e) => update(s.key, { negativeMarksPerQuestion: e.target.value })}
                    />
                  )}
                </Field>
              </div>
              {s.pickMode === 'random' ? (
                <RandomSection s={s} update={(patch) => update(s.key, patch)} />
              ) : (
                <>
                  {s.questions.length ? (
                    <ol className="divide-y divide-border rounded-sm border border-border">
                      {s.questions.map((q, j) => (
                        <li key={q.questionId} className="flex flex-wrap items-center gap-2 p-2">
                          <span className="w-6 text-right text-sm text-text-muted">{j + 1}.</span>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-sm text-text">{q.preview || '(image only)'}</p>
                            <p className="text-xs text-text-muted">
                              {QUESTION_TYPE_LABEL[q.type]} · default {q.defaultMarks} mark
                              {q.defaultMarks === 1 ? '' : 's'}
                            </p>
                          </div>
                          {q.status !== 'published' ? (
                            <Badge tone="warning">
                              {q.status === 'deleted' ? 'Deleted' : 'Not published'}
                            </Badge>
                          ) : null}
                          <Input
                            aria-label={`Marks for question ${j + 1}`}
                            className="h-8 w-20"
                            inputMode="decimal"
                            placeholder="Marks"
                            value={q.marks}
                            onChange={(e) =>
                              update(s.key, {
                                questions: s.questions.map((x) =>
                                  x.questionId === q.questionId ? { ...x, marks: e.target.value } : x,
                                ),
                              })
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Move question ${j + 1} up`}
                            disabled={j === 0}
                            onClick={() => update(s.key, { questions: move(s.questions, j, -1) })}
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove question ${j + 1}`}
                            onClick={() =>
                              update(s.key, {
                                questions: s.questions.filter((x) => x.questionId !== q.questionId),
                              })
                            }
                          >
                            <Trash2 />
                          </Button>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-text-muted">No questions in this section yet.</p>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    onClick={() => setPicking(s.key)}
                  >
                    <Plus /> Add questions
                  </Button>
                </>
              )}
            </div>
          </section>
        ))}
        <Button
          variant="soft"
          className="self-start"
          onClick={() =>
            setSections((l) => [
              ...l,
              {
                key: newKey(),
                title: '',
                pickMode: 'fixed',
                questions: [],
                filter: {
                  subjectId: assessment.subject?.id ?? '',
                  chapterId: '',
                  topicId: '',
                  difficulty: '',
                  types: [],
                  tags: '',
                  pyqOnly: false,
                },
                questionCount: '',
                marksPerQuestion: '',
                negativeMarksPerQuestion: '',
              },
            ])
          }
        >
          <Plus /> Add section
        </Button>
      </div>
      {picking ? (
        <QuestionPicker
          exclude={allFixed}
          onClose={() => setPicking(null)}
          onAdd={(rows) => {
            const s = sections.find((x) => x.key === picking);
            if (s) {
              update(picking, {
                questions: [
                  ...s.questions,
                  ...rows.map((r) => ({
                    questionId: r.id,
                    type: r.type,
                    status: r.status,
                    preview: r.preview,
                    defaultMarks: r.defaultMarks,
                    marks: '',
                    negativeMarks: '',
                  })),
                ],
              });
            }
            setPicking(null);
          }}
        />
      ) : null}
    </Card>
  );
}
