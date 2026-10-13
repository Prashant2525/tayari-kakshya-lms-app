import { AssessmentInput, type AssessmentType, type PublishStatus } from '@tk/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2, Save, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { RichTextEditor } from '@/components/content/rich-text-editor';
import { StatusBadge } from '@/components/content/status';
import { AssessmentPreviewButton } from '@/components/content/qa';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Card, CardHeader, ErrorState, Spinner, Switch } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import {
  ASSESSMENT_TYPE_LABEL,
  COUNTED_ATTEMPT_LABEL,
  LATE_START_LABEL,
  PREMIUM_ACCESS_HINT,
  PREMIUM_ACCESS_LABEL,
  RESULT_RELEASE_LABEL,
  SUBJECTIVE_GRADING_LABEL,
  type AssessmentDefaults,
  type AssessmentDetail,
  type ScoringRules,
} from '@/lib/assessments';
import { useAuth } from '@/lib/auth';
import {
  isoToNepalLocal,
  nepalLocalToIso,
  STATUS_LABEL,
  toLocalized,
  type CourseRow,
  type CursorPage,
  type ExamNode,
  type SubjectRow,
  type SubjectTree,
} from '@/lib/content';
import { formatDateTimeBs, localized } from '@/lib/format';
import { useNodeTypes } from '@/lib/node-types';
import { isEmptyDoc, type JsonNode } from '@/lib/rich-doc';
import { cn } from '@/lib/utils';
import { StructureEditor } from './structure-editor';

type Scoring = { [K in keyof ScoringRules]: string };

interface Draft {
  titleEn: string;
  titleNe: string;
  instructionsEn: JsonNode | null;
  instructionsNe: JsonNode | null;
  courseId: string;
  subjectId: string;
  chapterId: string;
  topicId: string;
  examNodeId: string;
  accessLevel: 'free' | 'premium';
  availability: 'always' | 'window';
  opensAt: string;
  closesAt: string;
  durationMinutes: string;
  maxAttempts: string;
  passMarks: string;
  scoring: Scoring;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  resultRelease: string;
  showExplanations: boolean;
  leaderboardEnabled: boolean;
  subjectiveGrading: string;
  premiumAccess: string;
  lateStart: string;
  countedAttempt: string;
  challengeDate: string;
}

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function draftOf(a: AssessmentDetail | null, d: AssessmentDefaults | undefined): Draft {
  return {
    titleEn: a?.title.en ?? '',
    titleNe: a?.title.ne ?? '',
    instructionsEn: (a?.instructions?.en as JsonNode | undefined) ?? null,
    instructionsNe: (a?.instructions?.ne as JsonNode | undefined) ?? null,
    courseId: a?.course?.id ?? '',
    subjectId: a?.subject?.id ?? '',
    chapterId: a?.chapter?.id ?? '',
    topicId: a?.topic?.id ?? '',
    examNodeId: a?.examNode?.id ?? '',
    accessLevel: a?.accessLevel ?? 'premium',
    availability: a?.availability ?? 'always',
    opensAt: isoToNepalLocal(a?.opensAt),
    closesAt: isoToNepalLocal(a?.closesAt),
    durationMinutes: s(a?.durationMinutes),
    maxAttempts: s(a ? a.maxAttempts : d?.maxAttempts),
    passMarks: s(a?.passMarks),
    scoring: {
      negativeMarking: s(a ? a.scoring.negativeMarking : d?.scoring.negativeMarking),
      multipleChoice: s(a ? a.scoring.multipleChoice : d?.scoring.multipleChoice),
      match: s(a ? a.scoring.match : d?.scoring.match),
      fillBlank: s(a ? a.scoring.fillBlank : d?.scoring.fillBlank),
      scoreFloor: s(a ? a.scoring.scoreFloor : d?.scoring.scoreFloor),
    },
    shuffleQuestions: a?.shuffleQuestions ?? false,
    shuffleOptions: a?.shuffleOptions ?? false,
    resultRelease: a?.resultRelease ?? d?.resultRelease ?? '',
    showExplanations: a?.showExplanations ?? d?.showExplanations ?? true,
    leaderboardEnabled: a?.leaderboardEnabled ?? false,
    subjectiveGrading: a?.subjectiveGrading ?? 'none',
    premiumAccess: a?.premiumAccess ?? d?.premiumAccess ?? '',
    lateStart: a?.lateStart ?? d?.lateStart ?? '',
    countedAttempt: a?.countedAttempt ?? d?.countedAttempt ?? '',
    challengeDate: a?.challengeDate ?? '',
  };
}

const intOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

function toInput(type: AssessmentType, d: Draft): unknown {
  const instructions =
    isEmptyDoc(d.instructionsEn) && isEmptyDoc(d.instructionsNe)
      ? null
      : {
          ...(isEmptyDoc(d.instructionsEn) ? {} : { en: d.instructionsEn }),
          ...(isEmptyDoc(d.instructionsNe) ? {} : { ne: d.instructionsNe }),
        };
  return {
    type,
    title: toLocalized(d.titleEn, d.titleNe),
    instructions,
    courseId: d.courseId || null,
    subjectId: d.subjectId || null,
    chapterId: d.chapterId || null,
    topicId: d.topicId || null,
    examNodeId: d.examNodeId || null,
    accessLevel: d.accessLevel,
    availability: d.availability,
    opensAt: d.availability === 'window' ? nepalLocalToIso(d.opensAt) : null,
    closesAt: d.availability === 'window' ? nepalLocalToIso(d.closesAt) : null,
    durationMinutes: intOrNull(d.durationMinutes),
    maxAttempts: intOrNull(d.maxAttempts),
    passMarks: d.passMarks.trim() === '' ? null : Number(d.passMarks),
    scoring: {
      negativeMarking: d.scoring.negativeMarking === '' ? undefined : d.scoring.negativeMarking === 'true',
      multipleChoice: d.scoring.multipleChoice || undefined,
      match: d.scoring.match || undefined,
      fillBlank: d.scoring.fillBlank || undefined,
      scoreFloor: d.scoring.scoreFloor || undefined,
    },
    shuffleQuestions: d.shuffleQuestions,
    shuffleOptions: d.shuffleOptions,
    resultRelease: d.resultRelease || undefined,
    showExplanations: d.showExplanations,
    leaderboardEnabled: d.leaderboardEnabled,
    subjectiveGrading: d.subjectiveGrading,
    premiumAccess: d.premiumAccess || undefined,
    lateStart: d.lateStart || undefined,
    countedAttempt: d.countedAttempt || undefined,
    challengeDate: type === 'daily_challenge' ? d.challengeDate || null : null,
  };
}

const LABELS: Record<string, string> = {
  title: 'Title',
  opensAt: 'Opens',
  closesAt: 'Closes',
  durationMinutes: 'Duration',
  maxAttempts: 'Attempts',
  passMarks: 'Pass marks',
  negativeMarking: 'Negative marking',
  multipleChoice: 'Multiple-answer scoring',
  match: 'Match scoring',
  fillBlank: 'Fill-in-the-blank scoring',
  scoreFloor: 'Lowest total',
  premiumAccess: 'Premium access',
  lateStart: 'Late start',
  countedAttempt: 'Official attempt',
  resultRelease: 'Results',
  challengeDate: 'Challenge day',
  chapterId: 'Chapter',
  subjectId: 'Subject',
};

function problemsOf(type: AssessmentType, d: Draft): string[] {
  const r = AssessmentInput.safeParse(toInput(type, d));
  if (r.success) return [];
  return [
    ...new Set(
      r.error.issues.map((i) => {
        const key = [...i.path].reverse().find((p) => typeof p === 'string' && LABELS[p]) as
          string | undefined;
        const msg = /expected|Invalid/.test(i.message) ? 'Choose a value' : i.message;
        return `${key ? LABELS[key] : 'Form'}: ${msg}`;
      }),
    ),
  ];
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-sm border border-border p-3">
      <div>
        <p className="text-sm font-semibold text-text">{label}</p>
        {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} label={label} />
    </div>
  );
}

function ChoiceSelect({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
  hint?: ReactNode;
}) {
  return (
    <Field label={label} hint={hint}>
      {(a) => (
        <Select
          {...a}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(!value && 'border-warning')}
        >
          <option value="">Choose…</option>
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function PublishingCard({ a, onChanged }: { a: AssessmentDetail; onChanged: () => Promise<unknown> }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canPublish = can('assessments:publish');
  const [status, setStatus] = useState<PublishStatus>(a.status);
  const [when, setWhen] = useState(isoToNepalLocal(a.publishAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const options: PublishStatus[] = canPublish
    ? ['draft', 'in_review', 'scheduled', 'published', 'archived']
    : ['draft', 'in_review'];
  const r = a.readiness;
  const apply = async () => {
    setError(null);
    const publishAt = status === 'scheduled' ? nepalLocalToIso(when) : null;
    if (status === 'scheduled' && !publishAt) return setError('Choose when to publish');
    setBusy(true);
    try {
      await api.put(`/admin/assessments/${a.id}/publishing`, { status, publishAt });
      await onChanged();
      toast.success(`Status: ${STATUS_LABEL[status]}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader
        title="Publishing"
        description={<StatusBadge status={a.status} publishAt={a.publishAt} />}
      />
      <div className="flex flex-col gap-3 p-5">
        <div
          className={cn(
            'rounded-sm border p-3 text-sm',
            r.ready ? 'border-success/30 bg-success-soft' : 'border-warning/30 bg-warning-soft',
          )}
        >
          <p className="flex items-center gap-1.5 font-semibold text-text">
            {r.ready ? (
              <CheckCircle2 className="size-4 text-success" />
            ) : (
              <TriangleAlert className="size-4 text-warning" />
            )}
            {r.ready ? 'Ready to publish' : 'Not ready yet'}
          </p>
          <p className="mt-1 text-text-secondary">
            {r.questions} questions ·{' '}
            {r.totalMarks.min === r.totalMarks.max
              ? `${r.totalMarks.min} marks`
              : `${r.totalMarks.min}–${r.totalMarks.max} marks`}
          </p>
          {[...r.problems, ...r.warnings].length ? (
            <ul className="mt-2 list-disc pl-5 text-text-secondary">
              {r.problems.map((p) => (
                <li key={p.message} className="text-danger">
                  {p.section ? `Section ${p.section}: ` : ''}
                  {p.message}
                </li>
              ))}
              {r.warnings.map((p) => (
                <li key={p.message}>
                  {p.section ? `Section ${p.section}: ` : ''}
                  {p.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field label="Assessment status">
          {(f) => (
            <Select {...f} value={status} onChange={(e) => setStatus(e.target.value as PublishStatus)}>
              {options.map((o) => (
                <option key={o} value={o}>
                  {STATUS_LABEL[o]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {status === 'scheduled' ? (
          <Field
            label="Publish at (Nepal time)"
            hint={when ? formatDateTimeBs(nepalLocalToIso(when)) : undefined}
          >
            {(f) => (
              <Input {...f} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            )}
          </Field>
        ) : null}
        <Button
          onClick={() => void apply()}
          loading={busy}
          disabled={status === a.status && status !== 'scheduled'}
        >
          Update status
        </Button>
        {canPublish ? (
          <Button variant="ghost" className="text-danger" onClick={() => setDeleting(true)}>
            <Trash2 /> Delete assessment
          </Button>
        ) : null}
      </div>
      {deleting ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(false)}
          title="Delete this assessment?"
          description="Students will no longer see it. Questions stay in the question bank."
          confirmLabel="Delete"
          onConfirm={async () => {
            await api.delete(`/admin/assessments/${a.id}`);
            await qc.invalidateQueries({ queryKey: ['assessments'] });
            toast.success('Assessment deleted');
            void navigate({ to: '/assessments' });
          }}
        />
      ) : null}
    </Card>
  );
}

function AssessmentEditor({
  type,
  assessment,
  defaults,
}: {
  type: AssessmentType;
  assessment: AssessmentDetail | null;
  defaults?: AssessmentDefaults;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const nodeTypes = useNodeTypes();
  const [d, setD] = useState<Draft>(() => draftOf(assessment, defaults));
  const [lang, setLang] = useState<'en' | 'ne'>('en');
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setScoring = (k: keyof Scoring, v: string) =>
    setD((x) => ({ ...x, scoring: { ...x.scoring, [k]: v } }));
  const locked = assessment
    ? (assessment.status === 'published' || assessment.status === 'scheduled') && !can('assessments:publish')
    : false;

  const courses = useQuery({
    queryKey: ['courses', 'all'],
    queryFn: () => api.get<CursorPage<CourseRow>>('/admin/courses', { limit: 100 }),
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
  const nodes = useQuery({
    queryKey: ['exam-nodes', { showDeleted: false }],
    queryFn: () => api.get<ExamNode[]>('/admin/exam-nodes'),
  });
  const chapter = tree.data?.chapters.find((c) => c.id === d.chapterId);
  const nodePaths = useMemo(() => {
    const byId = new Map((nodes.data ?? []).map((n) => [n.id, n]));
    const path = (n: ExamNode): string => {
      const p = n.parentId ? byId.get(n.parentId) : undefined;
      return p ? `${path(p)} › ${localized(n.name)}` : localized(n.name);
    };
    return (nodes.data ?? [])
      .map((n) => ({ id: n.id, label: `${path(n)} (${nodeTypes.label(n.nodeType)})` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [nodes.data, nodeTypes]);

  const save = async () => {
    const found = problemsOf(type, d);
    setProblems(found);
    if (found.length) return;
    setSaving(true);
    try {
      const body = toInput(type, d);
      if (assessment) {
        const updated = await api.put<AssessmentDetail>(`/admin/assessments/${assessment.id}`, body);
        qc.setQueryData(['assessment', assessment.id], updated);
        toast.success('Saved');
      } else {
        const created = await api.post<AssessmentDetail>('/admin/assessments', body);
        qc.setQueryData(['assessment', created.id], created);
        toast.success('Assessment created as a draft. Now add its questions.');
        void navigate({
          to: '/assessments/$assessmentId',
          params: { assessmentId: created.id },
          replace: true,
        });
      }
      await qc.invalidateQueries({ queryKey: ['assessments'] });
    } catch (err) {
      setProblems([errorMessage(err)]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Link
        to="/assessments"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" /> Assessments
      </Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            {ASSESSMENT_TYPE_LABEL[type]}
          </p>
          <h1 className="text-[26px] font-bold leading-8 tracking-tight text-text">
            {assessment ? localized(assessment.title) : `New ${ASSESSMENT_TYPE_LABEL[type].toLowerCase()}`}
          </h1>
        </div>
        <Button onClick={() => void save()} loading={saving} disabled={locked}>
          <Save /> {assessment ? 'Save settings' : 'Create draft'}
        </Button>
      </div>
      {locked ? (
        <div className="mb-4">
          <Alert tone="warning" title="This assessment is live">
            Ask someone who can publish assessments to change it, or to move it back to draft first.
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
            <CardHeader title="Details" />
            <div className="flex flex-col gap-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Title (English)">
                  {(a) => <Input {...a} value={d.titleEn} onChange={(e) => set('titleEn', e.target.value)} />}
                </Field>
                <Field label="शीर्षक (नेपाली)">
                  {(a) => (
                    <Input
                      {...a}
                      lang="ne"
                      value={d.titleNe}
                      onChange={(e) => set('titleNe', e.target.value)}
                    />
                  )}
                </Field>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-semibold text-text">Instructions for students</span>
                  {(['en', 'ne'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLang(l)}
                      className={cn(
                        'rounded-sm px-2 py-0.5 text-sm',
                        lang === l ? 'bg-primary-soft font-semibold text-on-primary-soft' : 'text-text-muted',
                      )}
                    >
                      {l === 'en' ? 'English' : 'नेपाली'}
                    </button>
                  ))}
                </div>
                <div hidden={lang !== 'en'}>
                  <RichTextEditor
                    compact
                    label="Instructions (English)"
                    lang="en"
                    value={d.instructionsEn}
                    onChange={(v) => set('instructionsEn', v)}
                  />
                </div>
                <div hidden={lang !== 'ne'}>
                  <RichTextEditor
                    compact
                    label="Instructions (नेपाली)"
                    lang="ne"
                    value={d.instructionsNe}
                    onChange={(v) => set('instructionsNe', v)}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Course" hint="Optional: show it inside a course.">
                  {(a) => (
                    <Select {...a} value={d.courseId} onChange={(e) => set('courseId', e.target.value)}>
                      <option value="">None</option>
                      {(courses.data?.data ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {localized(c.title)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Exam category" hint="e.g. the post or exam stage this mock prepares for.">
                  {(a) => (
                    <Select {...a} value={d.examNodeId} onChange={(e) => set('examNodeId', e.target.value)}>
                      <option value="">None</option>
                      {nodePaths.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Subject" hint="Optional: for subject tests and chapter quizzes.">
                  {(a) => (
                    <Select
                      {...a}
                      value={d.subjectId}
                      onChange={(e) =>
                        setD((x) => ({ ...x, subjectId: e.target.value, chapterId: '', topicId: '' }))
                      }
                    >
                      <option value="">None</option>
                      {(subjects.data?.data ?? []).map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {localized(sub.name)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Chapter">
                    {(a) => (
                      <Select
                        {...a}
                        value={d.chapterId}
                        disabled={!d.subjectId}
                        onChange={(e) => setD((x) => ({ ...x, chapterId: e.target.value, topicId: '' }))}
                      >
                        <option value="">—</option>
                        {(tree.data?.chapters ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.numberLabel ? `${c.numberLabel} ` : ''}
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
                        value={d.topicId}
                        disabled={!chapter}
                        onChange={(e) => set('topicId', e.target.value)}
                      >
                        <option value="">—</option>
                        {(chapter?.topics ?? []).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.numberLabel ? `${t.numberLabel} ` : ''}
                            {localized(t.title)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>
              </div>
              <Field label="Who can take it" className="sm:max-w-sm">
                {(a) => (
                  <Select
                    {...a}
                    value={d.accessLevel}
                    onChange={(e) => set('accessLevel', e.target.value as Draft['accessLevel'])}
                  >
                    <option value="premium">Premium (course access)</option>
                    <option value="free">Free</option>
                  </Select>
                )}
              </Field>
              {d.accessLevel === 'premium' ? (
                <ChoiceSelect
                  label="Premium access"
                  hint={PREMIUM_ACCESS_HINT}
                  value={d.premiumAccess}
                  onChange={(v) => set('premiumAccess', v)}
                  options={Object.entries(PREMIUM_ACCESS_LABEL)}
                />
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Availability and timing" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {type === 'daily_challenge' ? (
                <Field label="Challenge day" hint="The Nepal calendar day this challenge belongs to.">
                  {(a) => (
                    <Input
                      {...a}
                      type="date"
                      value={d.challengeDate}
                      onChange={(e) => set('challengeDate', e.target.value)}
                    />
                  )}
                </Field>
              ) : null}
              <Field label="When can students take it">
                {(a) => (
                  <Select
                    {...a}
                    value={d.availability}
                    onChange={(e) => set('availability', e.target.value as Draft['availability'])}
                  >
                    <option value="always">Any time</option>
                    <option value="window">Only within a time window</option>
                  </Select>
                )}
              </Field>
              {d.availability === 'window' ? (
                <>
                  <Field
                    label="Opens (Nepal time)"
                    hint={d.opensAt ? formatDateTimeBs(nepalLocalToIso(d.opensAt)) : undefined}
                  >
                    {(a) => (
                      <Input
                        {...a}
                        type="datetime-local"
                        value={d.opensAt}
                        onChange={(e) => set('opensAt', e.target.value)}
                      />
                    )}
                  </Field>
                  <Field
                    label="Closes (Nepal time)"
                    hint={d.closesAt ? formatDateTimeBs(nepalLocalToIso(d.closesAt)) : undefined}
                  >
                    {(a) => (
                      <Input
                        {...a}
                        type="datetime-local"
                        value={d.closesAt}
                        onChange={(e) => set('closesAt', e.target.value)}
                      />
                    )}
                  </Field>
                  <ChoiceSelect
                    label="Late start"
                    hint="A student who starts shortly before the close."
                    value={d.lateStart}
                    onChange={(v) => set('lateStart', v)}
                    options={Object.entries(LATE_START_LABEL)}
                  />
                </>
              ) : null}
              <Field label="Duration (minutes)" hint="Blank = untimed.">
                {(a) => (
                  <Input
                    {...a}
                    inputMode="numeric"
                    value={d.durationMinutes}
                    onChange={(e) => set('durationMinutes', e.target.value)}
                  />
                )}
              </Field>
              <Field label="Attempts allowed" hint="Blank = unlimited.">
                {(a) => (
                  <Input
                    {...a}
                    inputMode="numeric"
                    value={d.maxAttempts}
                    onChange={(e) => set('maxAttempts', e.target.value)}
                  />
                )}
              </Field>
              <Field label="Pass marks" hint="Blank = no pass/fail.">
                {(a) => (
                  <Input
                    {...a}
                    inputMode="decimal"
                    value={d.passMarks}
                    onChange={(e) => set('passMarks', e.target.value)}
                  />
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Scoring"
              description="Your team decides these per assessment; nothing is assumed."
            />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <ChoiceSelect
                label="Negative marking"
                value={d.scoring.negativeMarking}
                onChange={(v) => setScoring('negativeMarking', v)}
                options={[
                  ['true', 'On: deduct negative marks for wrong answers'],
                  ['false', 'Off: wrong answers score zero'],
                ]}
              />
              <ChoiceSelect
                label="Lowest total"
                value={d.scoring.scoreFloor}
                onChange={(v) => setScoring('scoreFloor', v)}
                options={[
                  ['zero', 'Never below zero'],
                  ['none', 'Can go below zero'],
                ]}
              />
              <ChoiceSelect
                label="Multiple-answer questions"
                value={d.scoring.multipleChoice}
                onChange={(v) => setScoring('multipleChoice', v)}
                options={[
                  ['all_or_nothing', 'All or nothing'],
                  ['partial_if_no_wrong', 'Part marks if no wrong option chosen'],
                ]}
              />
              <ChoiceSelect
                label="Match the following"
                value={d.scoring.match}
                onChange={(v) => setScoring('match', v)}
                options={[
                  ['all_or_nothing', 'All or nothing'],
                  ['per_pair', 'Part marks per correct pair'],
                ]}
              />
              <ChoiceSelect
                label="Fill in the blank (several blanks)"
                value={d.scoring.fillBlank}
                onChange={(v) => setScoring('fillBlank', v)}
                options={[
                  ['all_or_nothing', 'All or nothing'],
                  ['per_blank', 'Part marks per correct blank'],
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Results and display" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <ChoiceSelect
                label="When students see results"
                value={d.resultRelease}
                onChange={(v) => set('resultRelease', v)}
                options={Object.entries(RESULT_RELEASE_LABEL)}
              />
              <Field label="Written (subjective) answers">
                {(a) => (
                  <Select
                    {...a}
                    value={d.subjectiveGrading}
                    onChange={(e) => set('subjectiveGrading', e.target.value)}
                  >
                    {Object.entries(SUBJECTIVE_GRADING_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <ChoiceSelect
                label="Official attempt"
                hint="With retakes: which attempt counts for the result, pass/fail and rank."
                value={d.countedAttempt}
                onChange={(v) => set('countedAttempt', v)}
                options={Object.entries(COUNTED_ATTEMPT_LABEL)}
              />
              <Toggle
                label="Show explanations"
                hint="After results are released."
                checked={d.showExplanations}
                onChange={(v) => set('showExplanations', v)}
              />
              <Toggle
                label="Leaderboard"
                hint="Rank students by score."
                checked={d.leaderboardEnabled}
                onChange={(v) => set('leaderboardEnabled', v)}
              />
              <Toggle
                label="Shuffle questions"
                checked={d.shuffleQuestions}
                onChange={(v) => set('shuffleQuestions', v)}
              />
              <Toggle
                label="Shuffle options"
                hint="Each student sees the choices, and the right-hand column of match questions, in their own order."
                checked={d.shuffleOptions}
                onChange={(v) => set('shuffleOptions', v)}
              />
            </div>
          </Card>

          {assessment ? (
            <StructureEditor key={assessment.updatedAt} assessment={assessment} disabled={locked} />
          ) : (
            <p className="text-sm text-text-muted">
              Create the draft first, then add sections and questions.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-6">
          {assessment ? (
            <Card>
              <CardHeader
                title="Results"
                description="Attempts, statistics, grading and releasing results."
                actions={
                  <Link
                    to="/assessments/$assessmentId/results"
                    params={{ assessmentId: assessment.id }}
                    className="text-sm font-semibold text-link"
                  >
                    View results
                  </Link>
                }
              />
            </Card>
          ) : null}
          {assessment ? (
            <AssessmentPreviewButton assessmentId={assessment.id} version={assessment.updatedAt} />
          ) : null}
          {assessment ? (
            <PublishingCard
              key={`${assessment.status}-${assessment.updatedAt}`}
              a={assessment}
              onChanged={() =>
                Promise.all([
                  qc.invalidateQueries({ queryKey: ['assessment', assessment.id] }),
                  qc.invalidateQueries({ queryKey: ['assessments'] }),
                ])
              }
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

export function NewAssessmentPage() {
  const { type } = useSearch({ from: '/app/assessments/new' });
  const defaults = useQuery({
    queryKey: ['assessment-defaults'],
    queryFn: () => api.get<AssessmentDefaults>('/admin/assessments/defaults'),
  });
  if (defaults.isPending) return <Spinner />;
  return <AssessmentEditor key={type} type={type} assessment={null} defaults={defaults.data} />;
}

export function AssessmentPage() {
  const { assessmentId } = useParams({ from: '/app/assessments/$assessmentId' });
  const a = useQuery({
    queryKey: ['assessment', assessmentId],
    queryFn: () => api.get<AssessmentDetail>(`/admin/assessments/${assessmentId}`),
  });
  if (a.isPending) return <Spinner />;
  if (a.isError) return <ErrorState error={a.error} onRetry={() => void a.refetch()} />;
  // Keyed by id only: saving the questions must not discard unsaved settings above them.
  return <AssessmentEditor key={a.data.id} type={a.data.type} assessment={a.data} />;
}
