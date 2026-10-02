import type { PublishStatus, QuestionType } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ArrowLeft, Plus, Save, Trash2, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { RichTextEditor } from '@/components/content/rich-text-editor';
import { StatusBadge } from '@/components/content/status';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  Checkbox,
  ErrorState,
  Spinner,
  Switch,
} from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  NODE_TYPE_LABEL,
  STATUS_LABEL,
  toLocalized,
  type CursorPage,
  type ExamNode,
  type Paper,
  type SubjectRow,
  type SubjectTree,
} from '@/lib/content';
import { formatRelative, localized } from '@/lib/format';
import {
  blanksInStem,
  draftFromDetail,
  draftToInput,
  emptyDraft,
  nextId,
  QUESTION_TYPE_LABEL,
  validateDraft,
  type Bilingual,
  type ChoiceDraft,
  type QuestionDetail,
  type QuestionDraft,
} from '@/lib/questions';
import { cn } from '@/lib/utils';

type Lang = 'en' | 'ne';

/** One rich-text field shown in the language currently being edited; both editors stay mounted. */
function BilingualField({
  label,
  value,
  lang,
  onChange,
  compact,
  toolbarExtra,
}: {
  label: string;
  value: Bilingual;
  lang: Lang;
  onChange: (v: Bilingual) => void;
  compact?: boolean;
  toolbarExtra?: Parameters<typeof RichTextEditor>[0]['toolbarExtra'];
}) {
  return (
    <>
      <div hidden={lang !== 'en'}>
        <RichTextEditor
          label={`${label} (English)`}
          lang="en"
          compact={compact}
          value={value.en}
          toolbarExtra={toolbarExtra}
          onChange={(doc) => onChange({ ...value, en: doc })}
        />
      </div>
      <div hidden={lang !== 'ne'}>
        <RichTextEditor
          label={`${label} (नेपाली)`}
          lang="ne"
          compact={compact}
          value={value.ne}
          toolbarExtra={toolbarExtra}
          onChange={(doc) => onChange({ ...value, ne: doc })}
        />
      </div>
    </>
  );
}

function ChoiceList({
  title,
  items,
  lang,
  onChange,
  idPrefix,
  min,
  max,
  marker,
}: {
  title: string;
  items: ChoiceDraft[];
  lang: Lang;
  onChange: (items: ChoiceDraft[]) => void;
  idPrefix: 'letter' | 'l' | 'r';
  min: number;
  max: number;
  marker?: (item: ChoiceDraft) => ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-semibold text-text">{title}</legend>
      {items.map((item, i) => (
        <div key={item.id} className="flex items-start gap-2">
          <span className="mt-2 grid size-7 shrink-0 place-items-center rounded-full bg-surface-muted text-xs font-bold uppercase text-text-secondary">
            {item.id}
          </span>
          <div className="min-w-0 flex-1">
            <BilingualField
              label={`${title} ${item.id}`}
              compact
              lang={lang}
              value={item}
              onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, ...v } : x)))}
            />
          </div>
          {marker ? <div className="mt-2">{marker(item)}</div> : null}
          <Button
            variant="ghost"
            size="icon"
            className="mt-1"
            aria-label={`Remove ${title.toLowerCase()} ${item.id}`}
            disabled={items.length <= min}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      {items.length < max ? (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() =>
            onChange([
              ...items,
              {
                id: nextId(
                  items.map((x) => x.id),
                  idPrefix,
                ),
                en: null,
                ne: null,
              },
            ])
          }
        >
          <Plus /> Add
        </Button>
      ) : null}
    </fieldset>
  );
}

function TagsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const suggestions = useQuery({
    queryKey: ['question-tags', text],
    queryFn: () =>
      api.get<Array<{ name: string; questionCount: number }>>('/admin/question-tags', { q: text }),
    enabled: text.trim().length > 0,
  });
  const add = (raw: string) => {
    const tag = raw.trim().replace(/\s+/g, ' ');
    if (tag && !value.some((v) => v.toLowerCase() === tag.toLowerCase()) && value.length < 30)
      onChange([...value, tag]);
    setText('');
  };
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-on-primary-soft"
          >
            {t}
            <button
              type="button"
              aria-label={`Remove tag ${t}`}
              onClick={() => onChange(value.filter((x) => x !== t))}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <Input
        aria-label="Add a tag"
        list="question-tag-suggestions"
        value={text}
        placeholder="Type a tag and press Enter"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(text);
          }
        }}
      />
      <datalist id="question-tag-suggestions">
        {(suggestions.data ?? []).map((s) => (
          <option key={s.name} value={s.name} />
        ))}
      </datalist>
    </div>
  );
}

function PassageDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [lang, setLang] = useState<Lang>('en');
  const [titleEn, setTitleEn] = useState('');
  const [passage, setPassage] = useState<Bilingual>({ en: null, ne: null });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const body = {
      title: toLocalized(titleEn, ''),
      passage: { ...(passage.en ? { en: passage.en } : {}), ...(passage.ne ? { ne: passage.ne } : {}) },
    };
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<{ id: string }>('/admin/question-groups', body);
      await qc.invalidateQueries({ queryKey: ['question-groups'] });
      onCreated(created.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title="New passage"
      description="A reading passage shared by several comprehension questions."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            Save passage
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field label="Title (for staff)">
          {(a) => <Input {...a} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />}
        </Field>
        <LangSwitch lang={lang} onChange={setLang} />
        <BilingualField label="Passage" lang={lang} value={passage} onChange={setPassage} />
      </div>
    </Dialog>
  );
}

function LangSwitch({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div
      className="inline-flex rounded-sm border border-border p-0.5"
      role="tablist"
      aria-label="Editing language"
    >
      {(
        [
          ['en', 'English'],
          ['ne', 'नेपाली'],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={lang === value}
          onClick={() => onChange(value)}
          className={cn(
            'rounded-[5px] px-3 py-1 text-sm font-semibold',
            lang === value ? 'bg-primary text-on-primary' : 'text-text-secondary hover:text-text',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function AnswerSection({
  type,
  d,
  set,
  lang,
}: {
  type: QuestionType;
  d: QuestionDraft;
  set: <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) => void;
  lang: Lang;
}) {
  if (type === 'single_choice' || type === 'multiple_choice') {
    const single = type === 'single_choice';
    return (
      <ChoiceList
        title="Options"
        items={d.options}
        lang={lang}
        idPrefix="letter"
        min={2}
        max={10}
        onChange={(options) => {
          set('options', options);
          set(
            'correct',
            d.correct.filter((id) => options.some((o) => o.id === id)),
          );
        }}
        marker={(o) =>
          single ? (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
              <input
                type="radio"
                name="correct-option"
                aria-label={`Option ${o.id} is correct`}
                checked={d.correct[0] === o.id}
                onChange={() => set('correct', [o.id])}
                className="size-4 accent-[var(--tk-success)]"
              />
              Correct
            </label>
          ) : (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
              <Checkbox
                checked={d.correct.includes(o.id)}
                onCheckedChange={(on) =>
                  set('correct', on ? [...d.correct, o.id] : d.correct.filter((x) => x !== o.id))
                }
              />
              <span>Correct</span>
            </label>
          )
        }
      />
    );
  }
  if (type === 'true_false') {
    return (
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-text">Correct answer</legend>
        <div className="flex gap-4">
          {(
            [
              ['true', 'True'],
              ['false', 'False'],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className="flex items-center gap-2 text-sm text-text">
              <input
                type="radio"
                name="true-false"
                checked={d.trueFalse === v}
                onChange={() => set('trueFalse', v)}
                className="size-4 accent-[var(--tk-success)]"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  if (type === 'fill_blank') {
    const used = blanksInStem(d.stem);
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">
          Use <strong>Insert blank</strong> in the question toolbar (or type <code>[[b1]]</code>). Add every
          accepted answer on its own line; matching ignores spacing, and capital letters unless you tick “Case
          sensitive”.
        </p>
        {d.blanks.length === 0 ? <p className="text-sm text-text-muted">No blanks yet.</p> : null}
        {d.blanks.map((b, i) => (
          <div
            key={b.id}
            className="grid gap-3 rounded-sm border border-border p-3 sm:grid-cols-[80px_1fr_auto]"
          >
            <div className="text-sm font-semibold text-text">
              [[{b.id}]]
              {!used.includes(b.id) ? (
                <Badge tone="warning" className="mt-1">
                  Not in question
                </Badge>
              ) : null}
            </div>
            <Field label={`Accepted answers for ${b.id}`} hint="One per line">
              {(a) => (
                <Textarea
                  {...a}
                  rows={2}
                  value={b.accepted}
                  onChange={(e) =>
                    set(
                      'blanks',
                      d.blanks.map((x, j) => (j === i ? { ...x, accepted: e.target.value } : x)),
                    )
                  }
                />
              )}
            </Field>
            <div className="flex flex-col items-end gap-2">
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <Switch
                  checked={b.caseSensitive}
                  label={`Case sensitive ${b.id}`}
                  onCheckedChange={(v) =>
                    set(
                      'blanks',
                      d.blanks.map((x, j) => (j === i ? { ...x, caseSensitive: v } : x)),
                    )
                  }
                />
                Case sensitive
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  set(
                    'blanks',
                    d.blanks.filter((_, j) => j !== i),
                  )
                }
              >
                <Trash2 /> Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (type === 'match') {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <ChoiceList
            title="Left column"
            items={d.left}
            lang={lang}
            idPrefix="l"
            min={2}
            max={10}
            onChange={(left) => {
              set('left', left);
              set(
                'pairs',
                Object.fromEntries(Object.entries(d.pairs).filter(([l]) => left.some((x) => x.id === l))),
              );
            }}
          />
          <ChoiceList
            title="Right column"
            items={d.right}
            lang={lang}
            idPrefix="r"
            min={2}
            max={15}
            onChange={(right) => {
              set('right', right);
              set(
                'pairs',
                Object.fromEntries(Object.entries(d.pairs).filter(([, r]) => right.some((x) => x.id === r))),
              );
            }}
          />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-text">Correct pairs</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {d.left.map((l) => (
              <Field key={l.id} label={`${l.id} matches`}>
                {(a) => (
                  <Select
                    {...a}
                    value={d.pairs[l.id] ?? ''}
                    onChange={(e) => set('pairs', { ...d.pairs, [l.id]: e.target.value })}
                  >
                    <option value="">Choose…</option>
                    {d.right.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-muted">Extra right-column items act as distractors.</p>
        </fieldset>
      </div>
    );
  }
  if (type === 'numeric') {
    return (
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Correct value">
          {(a) => (
            <Input
              {...a}
              inputMode="decimal"
              value={d.numericValue}
              onChange={(e) => set('numericValue', e.target.value)}
            />
          )}
        </Field>
        <Field label="Tolerance (±)" hint="0 = exact">
          {(a) => (
            <Input
              {...a}
              inputMode="decimal"
              value={d.tolerance}
              onChange={(e) => set('tolerance', e.target.value)}
            />
          )}
        </Field>
        <Field label="Unit (English)">
          {(a) => <Input {...a} value={d.unitEn} onChange={(e) => set('unitEn', e.target.value)} />}
        </Field>
        <Field label="एकाइ (नेपाली)">
          {(a) => <Input {...a} lang="ne" value={d.unitNe} onChange={(e) => set('unitNe', e.target.value)} />}
        </Field>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-text">Model answer</p>
      <BilingualField
        label="Model answer"
        lang={lang}
        value={d.modelAnswer}
        onChange={(v) => set('modelAnswer', v)}
      />
    </div>
  );
}

function PublishingCard({ q, onChanged }: { q: QuestionDetail; onChanged: () => Promise<unknown> }) {
  const { can } = useAuth();
  const canPublish = can('questions:publish');
  const [status, setStatus] = useState<PublishStatus>(q.status);
  const [busy, setBusy] = useState(false);
  const options: PublishStatus[] = canPublish
    ? ['draft', 'in_review', 'published', 'archived']
    : ['draft', 'in_review'];
  return (
    <Card>
      <CardHeader title="Publishing" description={<StatusBadge status={q.status} />} />
      <div className="flex flex-col gap-3 p-5">
        <Field label="Question status">
          {(a) => (
            <Select {...a} value={status} onChange={(e) => setStatus(e.target.value as PublishStatus)}>
              {options.map((o) => (
                <option key={o} value={o}>
                  {STATUS_LABEL[o]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button
          loading={busy}
          disabled={status === q.status}
          onClick={async () => {
            setBusy(true);
            try {
              await api.put(`/admin/questions/${q.id}/status`, { status });
              await onChanged();
              toast.success(`Status: ${STATUS_LABEL[status]}`);
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Update status
        </Button>
        <p className="text-xs text-text-muted">
          Version {q.versionNo} of {q.versionCount} · updated {formatRelative(q.updatedAt)}. Changing the
          question text or answer creates a new version; past attempts keep the old one.
        </p>
        {q.openReports ? (
          <Link to="/question-reports" className="text-sm font-semibold text-danger hover:underline">
            {q.openReports} open report{q.openReports === 1 ? '' : 's'} from students
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

function QuestionEditor({ type, question }: { type: QuestionType; question: QuestionDetail | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [d, setD] = useState<QuestionDraft>(() => (question ? draftFromDetail(question) : emptyDraft(type)));
  const [lang, setLang] = useState<Lang>('en');
  const [dirty, setDirty] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [passageOpen, setPassageOpen] = useState(false);
  const locked = question?.status === 'published' && !can('questions:publish');

  const set = <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) => {
    setD((x) => ({ ...x, [key]: value }));
    setDirty(true);
  };

  useBlocker({
    shouldBlockFn: () => dirty && !window.confirm('You have unsaved changes. Leave without saving?'),
    enableBeforeUnload: () => dirty,
  });

  const subjects = useQuery({
    queryKey: ['subjects', 'all'],
    queryFn: () => api.get<CursorPage<SubjectRow>>('/admin/subjects', { limit: 100 }),
  });
  const tree = useQuery({
    queryKey: ['subject-tree', d.subjectId],
    queryFn: () => api.get<SubjectTree>(`/admin/subjects/${d.subjectId}/tree`),
    enabled: Boolean(d.subjectId),
  });
  const groups = useQuery({
    queryKey: ['question-groups'],
    queryFn: () =>
      api.get<Array<{ id: string; title: { en?: string; ne?: string } | null }>>('/admin/question-groups'),
  });
  const nodes = useQuery({
    queryKey: ['exam-nodes', { showDeleted: false }],
    queryFn: () => api.get<ExamNode[]>('/admin/exam-nodes'),
  });
  const papers = useQuery({ queryKey: ['papers'], queryFn: () => api.get<Paper[]>('/admin/papers') });
  const topics = useMemo(
    () =>
      (tree.data?.chapters ?? []).flatMap((c) =>
        c.topics.map((t) => ({
          id: t.id,
          label: `${c.numberLabel ? `${c.numberLabel} ` : ''}${localized(c.title)} › ${t.numberLabel ? `${t.numberLabel} ` : ''}${localized(t.title)}`,
        })),
      ),
    [tree.data],
  );

  // Keep the blank list in step with [[bN]] placeholders typed into the question.
  const syncBlanks = (stem: Bilingual) => {
    const ids = blanksInStem(stem);
    const missing = ids.filter((id) => !d.blanks.some((b) => b.id === id));
    set('stem', stem);
    if (missing.length)
      set('blanks', [...d.blanks, ...missing.map((id) => ({ id, accepted: '', caseSensitive: false }))]);
  };

  const save = async () => {
    const found = validateDraft(type, d);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      const body = draftToInput(type, d);
      if (question) {
        const updated = await api.put<QuestionDetail>(`/admin/questions/${question.id}`, body);
        qc.setQueryData(['question', question.id], updated);
        toast.success(
          updated.versionNo > question.versionNo ? `Saved as version ${updated.versionNo}` : 'Saved',
        );
      } else {
        const created = await api.post<QuestionDetail>('/admin/questions', body);
        qc.setQueryData(['question', created.id], created);
        toast.success('Question created as a draft');
        setDirty(false);
        setTimeout(
          () =>
            void navigate({
              to: '/questions/$questionId',
              params: { questionId: created.id },
              replace: true,
            }),
        );
      }
      setDirty(false);
      await qc.invalidateQueries({ queryKey: ['questions'] });
    } catch (err) {
      setProblems([errorMessage(err)]);
    } finally {
      setSaving(false);
    }
  };

  const insertBlank: Parameters<typeof RichTextEditor>[0]['toolbarExtra'] =
    type === 'fill_blank'
      ? (editor) => (
          <Button
            variant="soft"
            size="sm"
            className="ml-1"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const id = nextId([...d.blanks.map((b) => b.id), ...blanksInStem(d.stem)], 'b');
              editor.chain().focus().insertContent(`[[${id}]]`).run();
            }}
          >
            Insert blank
          </Button>
        )
      : undefined;

  return (
    <>
      <Link
        to="/questions"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" /> Question bank
      </Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            {QUESTION_TYPE_LABEL[type]}
          </p>
          <h1 className="text-[26px] font-bold leading-8 tracking-tight text-text">
            {question ? 'Edit question' : 'New question'}
          </h1>
        </div>
        <Button onClick={() => void save()} loading={saving} disabled={locked}>
          <Save /> {question ? 'Save changes' : 'Create draft'}
        </Button>
      </div>
      {locked ? (
        <div className="mb-4">
          <Alert tone="warning" title="This question is published">
            Ask someone who can publish questions to change it, or to move it back to draft first.
          </Alert>
        </div>
      ) : null}
      {problems.length ? (
        <div className="mb-4">
          <Alert tone="danger" title="Please fix these before saving">
            <ul className="list-disc pl-5">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
              <h2 className="text-[17px] font-semibold text-text">Question</h2>
              <LangSwitch lang={lang} onChange={setLang} />
            </div>
            <div className="flex flex-col gap-6 p-5">
              <BilingualField
                label="Question"
                lang={lang}
                value={d.stem}
                onChange={type === 'fill_blank' ? syncBlanks : (v) => set('stem', v)}
                toolbarExtra={insertBlank}
              />
              <AnswerSection type={type} d={d} set={set} lang={lang} />
              <div>
                <p className="mb-2 text-sm font-semibold text-text">
                  Explanation <span className="font-normal text-text-muted">(shown after submission)</span>
                </p>
                <BilingualField
                  label="Explanation"
                  lang={lang}
                  value={d.explanation}
                  onChange={(v) => set('explanation', v)}
                />
              </div>
            </div>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Details" />
            <div className="flex flex-col gap-4 p-5">
              <Field label="Subject">
                {(a) => (
                  <Select
                    {...a}
                    value={d.subjectId}
                    onChange={(e) => {
                      set('subjectId', e.target.value);
                      set('topicId', '');
                    }}
                  >
                    <option value="">Choose a subject…</option>
                    {(subjects.data?.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {localized(s.name)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Topic" hint="Optional">
                {(a) => (
                  <Select
                    {...a}
                    value={d.topicId}
                    disabled={!d.subjectId}
                    onChange={(e) => set('topicId', e.target.value)}
                  >
                    <option value="">Whole subject</option>
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Passage" hint="For comprehension questions that share a reading passage.">
                {(a) => (
                  <div className="flex gap-2">
                    <Select {...a} value={d.groupId} onChange={(e) => set('groupId', e.target.value)}>
                      <option value="">None</option>
                      {(groups.data ?? []).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title?.en ?? g.title?.ne ?? `Passage ${g.id.slice(-6)}`}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label="New passage"
                      onClick={() => setPassageOpen(true)}
                    >
                      <Plus />
                    </Button>
                  </div>
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Marks">
                  {(a) => (
                    <Input
                      {...a}
                      inputMode="decimal"
                      value={d.marks}
                      onChange={(e) => set('marks', e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Negative marks" hint="When wrong">
                  {(a) => (
                    <Input
                      {...a}
                      inputMode="decimal"
                      value={d.negativeMarks}
                      onChange={(e) => set('negativeMarks', e.target.value)}
                    />
                  )}
                </Field>
              </div>
              <Field label="Difficulty">
                {(a) => (
                  <Select
                    {...a}
                    value={d.difficulty}
                    onChange={(e) => set('difficulty', e.target.value as QuestionDraft['difficulty'])}
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </Select>
                )}
              </Field>
              <Field label="Access">
                {(a) => (
                  <Select
                    {...a}
                    value={d.accessLevel}
                    onChange={(e) => set('accessLevel', e.target.value as QuestionDraft['accessLevel'])}
                  >
                    <option value="premium">Premium</option>
                    <option value="free">Free practice</option>
                  </Select>
                )}
              </Field>
              <Field label="Content language">
                {(a) => (
                  <Select
                    {...a}
                    value={d.language}
                    onChange={(e) => set('language', e.target.value as QuestionDraft['language'])}
                  >
                    <option value="both">English and Nepali</option>
                    <option value="en">English</option>
                    <option value="ne">Nepali</option>
                  </Select>
                )}
              </Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="Tags" />
            <div className="p-5">
              <TagsInput value={d.tags} onChange={(v) => set('tags', v)} />
            </div>
          </Card>
          <Card>
            <CardHeader
              title="Previous-year question"
              description="Where and when this question was asked."
            />
            <div className="flex flex-col gap-3 p-5">
              {d.sources.map((s, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-sm border border-border p-3">
                  <Field label="Exam category">
                    {(a) => (
                      <Select
                        {...a}
                        value={s.examNodeId}
                        onChange={(e) =>
                          set(
                            'sources',
                            d.sources.map((x, j) => (j === i ? { ...x, examNodeId: e.target.value } : x)),
                          )
                        }
                      >
                        <option value="">—</option>
                        {(nodes.data ?? []).map((n) => (
                          <option key={n.id} value={n.id}>
                            {localized(n.name)} ({NODE_TYPE_LABEL[n.nodeType]})
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Paper">
                    {(a) => (
                      <Select
                        {...a}
                        value={s.paperId}
                        onChange={(e) =>
                          set(
                            'sources',
                            d.sources.map((x, j) => (j === i ? { ...x, paperId: e.target.value } : x)),
                          )
                        }
                      >
                        <option value="">—</option>
                        {(papers.data ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {localized(p.name)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <div className="grid grid-cols-[100px_1fr] gap-2">
                    <Field label="Year (BS)">
                      {(a) => (
                        <Input
                          {...a}
                          inputMode="numeric"
                          value={s.yearBs}
                          placeholder="2080"
                          onChange={(e) =>
                            set(
                              'sources',
                              d.sources.map((x, j) => (j === i ? { ...x, yearBs: e.target.value } : x)),
                            )
                          }
                        />
                      )}
                    </Field>
                    <Field label="Note">
                      {(a) => (
                        <Input
                          {...a}
                          value={s.note}
                          onChange={(e) =>
                            set(
                              'sources',
                              d.sources.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)),
                            )
                          }
                        />
                      )}
                    </Field>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-end"
                    onClick={() =>
                      set(
                        'sources',
                        d.sources.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 /> Remove
                  </Button>
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() =>
                  set('sources', [...d.sources, { examNodeId: '', paperId: '', yearBs: '', note: '' }])
                }
              >
                <Plus /> Add source
              </Button>
            </div>
          </Card>
          {question ? (
            <PublishingCard
              key={`${question.status}-${question.updatedAt}`}
              q={question}
              onChanged={() =>
                Promise.all([
                  qc.invalidateQueries({ queryKey: ['question', question.id] }),
                  qc.invalidateQueries({ queryKey: ['questions'] }),
                ])
              }
            />
          ) : null}
        </div>
      </div>
      {passageOpen ? (
        <PassageDialog
          onClose={() => setPassageOpen(false)}
          onCreated={(id) => {
            set('groupId', id);
            setPassageOpen(false);
            toast.success('Passage created');
          }}
        />
      ) : null}
    </>
  );
}

export function NewQuestionPage() {
  const { type } = useSearch({ from: '/app/questions/new' });
  return <QuestionEditor key={type} type={type} question={null} />;
}

export function QuestionPage() {
  const { questionId } = useParams({ from: '/app/questions/$questionId' });
  const q = useQuery({
    queryKey: ['question', questionId],
    queryFn: () => api.get<QuestionDetail>(`/admin/questions/${questionId}`),
  });
  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return <QuestionEditor key={`${q.data.id}-${q.data.updatedAt}`} type={q.data.type} question={q.data} />;
}
