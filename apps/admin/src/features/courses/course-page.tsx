import type { PublishStatus } from '@tk/contracts';
import { formatNpr, MoneyError, rupeesToPaisa } from '@tk/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { MediaField } from '@/components/content/media-picker';
import { RichTextEditor } from '@/components/content/rich-text-editor';
import { StatusBadge } from '@/components/content/status';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Card, CardHeader, Checkbox, ErrorState, Spinner, Switch } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  isoToNepalLocal,
  nepalLocalToIso,
  NODE_TYPE_LABEL,
  paisaToRupeesInput,
  STATUS_LABEL,
  toLocalized,
  type CourseDetail,
  type CursorPage,
  type ExamNode,
  type InstructorRow,
  type Paper,
  type SubjectRow,
} from '@/lib/content';
import { formatDateTimeBs, localized } from '@/lib/format';
import { isEmptyDoc, type JsonNode } from '@/lib/rich-doc';
import { cn } from '@/lib/utils';

type Tab = 'details' | 'pricing' | 'subjects' | 'links';
const TABS: Array<[Tab, string]> = [
  ['details', 'Details'],
  ['pricing', 'Pricing & validity'],
  ['subjects', 'Subjects'],
  ['links', 'Exams & instructors'],
];

/** Saves one section and refreshes the course; shows the server's message on failure. */
function useSection(courseId: string) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (fn: () => Promise<unknown>, success: string) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['course', courseId] }),
        qc.invalidateQueries({ queryKey: ['courses'] }),
      ]);
      toast.success(success);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, setError, save };
}

function SectionFooter({
  saving,
  disabled,
  onSave,
  note,
}: {
  saving: boolean;
  disabled?: boolean;
  onSave: () => void;
  note?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4">
      {note ? <p className="mr-auto text-xs text-text-muted">{note}</p> : null}
      <Button onClick={onSave} loading={saving} disabled={disabled}>
        Save
      </Button>
    </div>
  );
}

// ───────────── Details ─────────────

function DetailsSection({ course, readOnly }: { course: CourseDetail; readOnly: boolean }) {
  const s = useSection(course.id);
  const [v, setV] = useState({
    titleEn: course.title.en ?? '',
    titleNe: course.title.ne ?? '',
    slug: course.slug,
    shortEn: course.shortDescription?.en ?? '',
    shortNe: course.shortDescription?.ne ?? '',
    descEn: (course.description?.en as JsonNode | undefined) ?? null,
    descNe: (course.description?.ne as JsonNode | undefined) ?? null,
    thumbnailMediaId: course.thumbnailMediaId,
    language: course.language,
    isFeatured: course.isFeatured,
    popularityRank: course.popularityRank?.toString() ?? '',
  });
  const [descLang, setDescLang] = useState<'en' | 'ne'>('en');
  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) =>
    setV((x) => ({ ...x, [key]: value }));
  const submit = () => {
    if (!v.titleEn.trim() && !v.titleNe.trim())
      return s.setError('Enter the title in English, Nepali or both');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.slug))
      return s.setError('URL name: lowercase letters, numbers and single hyphens');
    if (v.popularityRank && !/^\d+$/.test(v.popularityRank))
      return s.setError('Popularity rank must be a whole number');
    const description =
      isEmptyDoc(v.descEn) && isEmptyDoc(v.descNe)
        ? null
        : {
            ...(isEmptyDoc(v.descEn) ? {} : { en: v.descEn }),
            ...(isEmptyDoc(v.descNe) ? {} : { ne: v.descNe }),
          };
    void s.save(
      () =>
        api.put(`/admin/courses/${course.id}`, {
          slug: v.slug,
          title: toLocalized(v.titleEn, v.titleNe),
          shortDescription: toLocalized(v.shortEn, v.shortNe),
          description,
          thumbnailMediaId: v.thumbnailMediaId,
          language: v.language,
          isFeatured: v.isFeatured,
          popularityRank: v.popularityRank ? Number(v.popularityRank) : null,
        }),
      'Details saved',
    );
  };
  return (
    <Card>
      <div className="flex flex-col gap-4 p-5">
        {s.error ? <Alert tone="danger" title={s.error} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title (English)">
            {(a) => (
              <Input
                {...a}
                value={v.titleEn}
                disabled={readOnly}
                onChange={(e) => set('titleEn', e.target.value)}
              />
            )}
          </Field>
          <Field label="शीर्षक (नेपाली)">
            {(a) => (
              <Input
                {...a}
                lang="ne"
                value={v.titleNe}
                disabled={readOnly}
                onChange={(e) => set('titleNe', e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="URL name" hint="Changing it breaks links that were already shared.">
          {(a) => (
            <Input {...a} value={v.slug} disabled={readOnly} onChange={(e) => set('slug', e.target.value)} />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Short description (English)" hint="Shown on course cards.">
            {(a) => (
              <Textarea
                {...a}
                value={v.shortEn}
                disabled={readOnly}
                onChange={(e) => set('shortEn', e.target.value)}
              />
            )}
          </Field>
          <Field label="छोटो विवरण (नेपाली)">
            {(a) => (
              <Textarea
                {...a}
                lang="ne"
                value={v.shortNe}
                disabled={readOnly}
                onChange={(e) => set('shortNe', e.target.value)}
              />
            )}
          </Field>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-1" role="tablist" aria-label="Description language">
            <span className="mr-2 text-sm font-semibold text-text">Full description</span>
            {(
              [
                ['en', 'English'],
                ['ne', 'नेपाली'],
              ] as const
            ).map(([lang, label]) => (
              <button
                key={lang}
                type="button"
                role="tab"
                aria-selected={descLang === lang}
                onClick={() => setDescLang(lang)}
                className={cn(
                  'rounded-sm px-3 py-1 text-sm',
                  descLang === lang
                    ? 'bg-primary-soft font-semibold text-on-primary-soft'
                    : 'text-text-muted hover:text-text',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div hidden={descLang !== 'en'}>
            <RichTextEditor
              label="Course description (English)"
              lang="en"
              value={v.descEn}
              onChange={(d) => set('descEn', d)}
            />
          </div>
          <div hidden={descLang !== 'ne'}>
            <RichTextEditor
              label="पाठ्यक्रम विवरण (नेपाली)"
              lang="ne"
              value={v.descNe}
              onChange={(d) => set('descNe', d)}
            />
          </div>
        </div>
        <MediaField
          kind="image"
          label="Thumbnail"
          value={v.thumbnailMediaId}
          onChange={(id) => set('thumbnailMediaId', id)}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Language">
            {(a) => (
              <Select
                {...a}
                value={v.language}
                disabled={readOnly}
                onChange={(e) => set('language', e.target.value as typeof v.language)}
              >
                <option value="both">English and Nepali</option>
                <option value="en">English</option>
                <option value="ne">Nepali</option>
              </Select>
            )}
          </Field>
          <Field label="Popularity rank" hint="1 = shown first. Optional.">
            {(a) => (
              <Input
                {...a}
                inputMode="numeric"
                value={v.popularityRank}
                disabled={readOnly}
                onChange={(e) => set('popularityRank', e.target.value)}
              />
            )}
          </Field>
          <div className="flex items-center justify-between gap-3 rounded-sm border border-border p-3 sm:mt-6">
            <span className="text-sm font-semibold text-text">Featured</span>
            <Switch
              checked={v.isFeatured}
              disabled={readOnly}
              onCheckedChange={(x) => set('isFeatured', x)}
              label="Featured"
            />
          </div>
        </div>
      </div>
      <SectionFooter saving={s.saving} disabled={readOnly} onSave={submit} />
    </Card>
  );
}

// ───────────── Pricing ─────────────

function parseRupees(value: string): number | null | 'invalid' {
  if (!value.trim()) return null;
  try {
    return rupeesToPaisa(value.replace(/,/g, ''));
  } catch (err) {
    if (err instanceof MoneyError) return 'invalid';
    throw err;
  }
}

function PricingSection({ course, readOnly }: { course: CourseDetail; readOnly: boolean }) {
  const s = useSection(course.id);
  const p = course.pricing;
  const [v, setV] = useState({
    price: paisaToRupeesInput(p.pricePaisa),
    sale: paisaToRupeesInput(p.salePricePaisa),
    saleStarts: isoToNepalLocal(p.saleStartsAt),
    saleEnds: isoToNepalLocal(p.saleEndsAt),
    validityType: p.validityType,
    validityDays: p.validityDays?.toString() ?? '',
    validityEndsOn: p.validityEndsOn ?? '',
  });
  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) =>
    setV((x) => ({ ...x, [key]: value }));
  const price = parseRupees(v.price);
  const sale = parseRupees(v.sale);
  const submit = () => {
    if (price === null || price === 'invalid')
      return s.setError('Enter the price in rupees, e.g. 3000 or 2999.50 (0 = free)');
    if (sale === 'invalid') return s.setError('Enter the sale price in rupees');
    if (v.validityType === 'days' && !/^\d+$/.test(v.validityDays))
      return s.setError('Enter the number of days');
    void s.save(
      () =>
        api.put(`/admin/courses/${course.id}/pricing`, {
          pricePaisa: price,
          salePricePaisa: sale,
          saleStartsAt: sale === null ? null : nepalLocalToIso(v.saleStarts),
          saleEndsAt: sale === null ? null : nepalLocalToIso(v.saleEnds),
          validityType: v.validityType,
          validityDays: v.validityType === 'days' ? Number(v.validityDays) : null,
          validityEndsOn: v.validityType === 'fixed_date' ? v.validityEndsOn || null : null,
        }),
      'Pricing saved',
    );
  };
  return (
    <Card>
      <CardHeader
        title="Price"
        description="Entered by your team; never calculated in the app. Amounts in Nepali rupees."
      />
      <div className="flex flex-col gap-4 p-5">
        {s.error ? <Alert tone="danger" title={s.error} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Price (Rs)"
            hint={
              typeof price === 'number'
                ? price === 0
                  ? 'Free course: students join with an Enrol button.'
                  : formatNpr(price, 'en')
                : undefined
            }
          >
            {(a) => (
              <Input
                {...a}
                inputMode="decimal"
                value={v.price}
                disabled={readOnly}
                onChange={(e) => set('price', e.target.value)}
              />
            )}
          </Field>
          <Field label="Sale price (Rs)" hint={typeof sale === 'number' ? formatNpr(sale, 'en') : 'Optional'}>
            {(a) => (
              <Input
                {...a}
                inputMode="decimal"
                value={v.sale}
                disabled={readOnly}
                onChange={(e) => set('sale', e.target.value)}
              />
            )}
          </Field>
        </div>
        {sale !== null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Sale starts (Nepal time)"
              hint={v.saleStarts ? formatDateTimeBs(nepalLocalToIso(v.saleStarts)) : 'Empty = now'}
            >
              {(a) => (
                <Input
                  {...a}
                  type="datetime-local"
                  value={v.saleStarts}
                  disabled={readOnly}
                  onChange={(e) => set('saleStarts', e.target.value)}
                />
              )}
            </Field>
            <Field
              label="Sale ends (Nepal time)"
              hint={v.saleEnds ? formatDateTimeBs(nepalLocalToIso(v.saleEnds)) : 'Empty = no end'}
            >
              {(a) => (
                <Input
                  {...a}
                  type="datetime-local"
                  value={v.saleEnds}
                  disabled={readOnly}
                  onChange={(e) => set('saleEnds', e.target.value)}
                />
              )}
            </Field>
          </div>
        ) : null}
      </div>
      <CardHeader
        title="Validity"
        description="How long a student keeps access after buying or enrolling."
        className="border-t"
      />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Access lasts">
          {(a) => (
            <Select
              {...a}
              value={v.validityType}
              disabled={readOnly}
              onChange={(e) => set('validityType', e.target.value as typeof v.validityType)}
            >
              <option value="days">A number of days</option>
              <option value="fixed_date">Until a fixed date</option>
              <option value="lifetime">Lifetime</option>
            </Select>
          )}
        </Field>
        {v.validityType === 'days' ? (
          <Field label="Days">
            {(a) => (
              <Input
                {...a}
                inputMode="numeric"
                value={v.validityDays}
                disabled={readOnly}
                onChange={(e) => set('validityDays', e.target.value)}
              />
            )}
          </Field>
        ) : v.validityType === 'fixed_date' ? (
          <Field label="Last day" hint="Access ends at midnight Nepal time after this day.">
            {(a) => (
              <Input
                {...a}
                type="date"
                value={v.validityEndsOn}
                disabled={readOnly}
                onChange={(e) => set('validityEndsOn', e.target.value)}
              />
            )}
          </Field>
        ) : null}
      </div>
      <SectionFooter
        saving={s.saving}
        disabled={readOnly}
        onSave={submit}
        note={readOnly ? 'Changing prices needs the pricing permission.' : 'iOS never shows prices (D-027).'}
      />
    </Card>
  );
}

// ───────────── Subjects ─────────────

interface SubjectLinkDraft {
  subjectId: string;
  name: string;
  paperId: string;
  full: string;
  pass: string;
  minutes: string;
}

function SubjectsSection({ course, readOnly }: { course: CourseDetail; readOnly: boolean }) {
  const s = useSection(course.id);
  const subjects = useQuery({
    queryKey: ['subjects', 'all'],
    queryFn: () => api.get<CursorPage<SubjectRow>>('/admin/subjects', { limit: 100 }),
  });
  const papers = useQuery({ queryKey: ['papers'], queryFn: () => api.get<Paper[]>('/admin/papers') });
  const [rows, setRows] = useState<SubjectLinkDraft[]>(
    course.subjects.map((x) => ({
      subjectId: x.subjectId,
      name: localized(x.name),
      paperId: x.paperId ?? '',
      full: x.displayFullMarks?.toString() ?? '',
      pass: x.displayPassMarks?.toString() ?? '',
      minutes: x.displayDurationMinutes?.toString() ?? '',
    })),
  );
  const [adding, setAdding] = useState('');
  const available = (subjects.data?.data ?? []).filter((x) => !rows.some((r) => r.subjectId === x.id));
  const update = (i: number, patch: Partial<SubjectLinkDraft>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const next = [...rs];
      const j = i + d;
      if (j < 0 || j >= next.length) return rs;
      [next[i], next[j]] = [next[j] as SubjectLinkDraft, next[i] as SubjectLinkDraft];
      return next;
    });
  const num = (x: string) => (x.trim() === '' ? null : Number(x));
  const submit = () => {
    for (const r of rows) {
      for (const [label, value] of [
        ['Full marks', r.full],
        ['Pass marks', r.pass],
        ['Minutes', r.minutes],
      ] as const) {
        if (value.trim() && Number.isNaN(Number(value)))
          return s.setError(`${r.name}: ${label} must be a number`);
      }
      if (r.full && r.pass && Number(r.pass) > Number(r.full))
        return s.setError(`${r.name}: pass marks cannot exceed full marks`);
    }
    void s.save(
      () =>
        api.put(`/admin/courses/${course.id}/subjects`, {
          subjects: rows.map((r) => ({
            subjectId: r.subjectId,
            paperId: r.paperId || null,
            displayFullMarks: num(r.full),
            displayPassMarks: num(r.pass),
            displayDurationMinutes: num(r.minutes),
          })),
        }),
      'Subjects saved',
    );
  };
  return (
    <Card>
      <CardHeader
        title="Subjects in this course"
        description="Students see them in this order. Marks shown here override the linked paper."
      />
      <div className="flex flex-col gap-3 p-5">
        {s.error ? <Alert tone="danger" title={s.error} /> : null}
        {rows.length === 0 ? <p className="text-sm text-text-muted">No subjects yet.</p> : null}
        <ol className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={r.subjectId} className="rounded-sm border border-border p-3">
              <div className="mb-3 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-semibold text-text">
                  {i + 1}. {r.name}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${r.name} up`}
                  disabled={readOnly || i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${r.name} down`}
                  disabled={readOnly || i === rows.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${r.name}`}
                  disabled={readOnly}
                  onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Paper">
                  {(a) => (
                    <Select
                      {...a}
                      value={r.paperId}
                      disabled={readOnly}
                      onChange={(e) => update(i, { paperId: e.target.value })}
                    >
                      <option value="">None</option>
                      {(papers.data ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {localized(p.name)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Full marks">
                  {(a) => (
                    <Input
                      {...a}
                      inputMode="decimal"
                      value={r.full}
                      disabled={readOnly}
                      onChange={(e) => update(i, { full: e.target.value })}
                    />
                  )}
                </Field>
                <Field label="Pass marks">
                  {(a) => (
                    <Input
                      {...a}
                      inputMode="decimal"
                      value={r.pass}
                      disabled={readOnly}
                      onChange={(e) => update(i, { pass: e.target.value })}
                    />
                  )}
                </Field>
                <Field label="Minutes">
                  {(a) => (
                    <Input
                      {...a}
                      inputMode="numeric"
                      value={r.minutes}
                      disabled={readOnly}
                      onChange={(e) => update(i, { minutes: e.target.value })}
                    />
                  )}
                </Field>
              </div>
            </li>
          ))}
        </ol>
        {!readOnly ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Add a subject" className="min-w-60 flex-1">
              {(a) => (
                <Select {...a} value={adding} onChange={(e) => setAdding(e.target.value)}>
                  <option value="">Choose a subject…</option>
                  {available.map((x) => (
                    <option key={x.id} value={x.id}>
                      {localized(x.name)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button
              variant="secondary"
              disabled={!adding}
              onClick={() => {
                const subject = available.find((x) => x.id === adding);
                if (!subject) return;
                setRows((rs) => [
                  ...rs,
                  {
                    subjectId: subject.id,
                    name: localized(subject.name),
                    paperId: '',
                    full: '',
                    pass: '',
                    minutes: '',
                  },
                ]);
                setAdding('');
              }}
            >
              <Plus /> Add
            </Button>
          </div>
        ) : null}
      </div>
      <SectionFooter saving={s.saving} disabled={readOnly} onSave={submit} />
    </Card>
  );
}

// ───────────── Exams & instructors ─────────────

function CheckList({
  items,
  selected,
  onToggle,
  disabled,
  empty,
}: {
  items: Array<{ id: string; label: string; hint?: string }>;
  selected: string[];
  onToggle: (id: string, on: boolean) => void;
  disabled: boolean;
  empty: string;
}) {
  const [filter, setFilter] = useState('');
  const visible = items.filter((i) => i.label.toLowerCase().includes(filter.trim().toLowerCase()));
  if (items.length === 0) return <p className="text-sm text-text-muted">{empty}</p>;
  return (
    <>
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter"
        aria-label="Filter"
        className="mb-2 h-9"
      />
      <ul className="max-h-72 overflow-y-auto">
        {visible.map((i) => {
          const id = `chk-${i.id}`;
          return (
            <li key={i.id} className="flex items-center gap-2 py-1.5">
              <Checkbox
                id={id}
                checked={selected.includes(i.id)}
                disabled={disabled}
                onCheckedChange={(on) => onToggle(i.id, on)}
              />
              <label htmlFor={id} className="text-sm text-text">
                {i.label}
                {i.hint ? <span className="ml-1.5 text-xs text-text-muted">{i.hint}</span> : null}
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function LinksSection({ course, readOnly }: { course: CourseDetail; readOnly: boolean }) {
  const s = useSection(course.id);
  const nodes = useQuery({
    queryKey: ['exam-nodes', { showDeleted: false }],
    queryFn: () => api.get<ExamNode[]>('/admin/exam-nodes'),
  });
  const instructors = useQuery({
    queryKey: ['instructors'],
    queryFn: () => api.get<InstructorRow[]>('/admin/instructors'),
  });
  const [examNodeIds, setExamNodeIds] = useState(course.examNodes.map((n) => n.id));
  const [instructorIds, setInstructorIds] = useState(course.instructors.map((i) => i.id));
  const nodeItems = useMemo(() => {
    const byId = new Map((nodes.data ?? []).map((n) => [n.id, n]));
    const path = (n: ExamNode): string => {
      const parent = n.parentId ? byId.get(n.parentId) : undefined;
      return parent ? `${path(parent)} › ${localized(n.name)}` : localized(n.name);
    };
    return (nodes.data ?? [])
      .map((n) => ({ id: n.id, label: path(n), hint: NODE_TYPE_LABEL[n.nodeType] }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [nodes.data]);
  const toggle = (setter: typeof setExamNodeIds) => (id: string, on: boolean) =>
    setter((ids) => (on ? [...ids, id] : ids.filter((x) => x !== id)));
  return (
    <Card>
      {s.error ? (
        <div className="px-5 pt-5">
          <Alert tone="danger" title={s.error} />
        </div>
      ) : null}
      <div className="grid gap-6 p-5 md:grid-cols-2">
        <section aria-labelledby="exams-title">
          <h3 id="exams-title" className="mb-1 font-semibold text-text">
            Exams this course prepares for
          </h3>
          <p className="mb-3 text-xs text-text-muted">
            Students find the course under these categories and posts.
          </p>
          {nodes.isPending ? (
            <Spinner />
          ) : (
            <CheckList
              items={nodeItems}
              selected={examNodeIds}
              onToggle={toggle(setExamNodeIds)}
              disabled={readOnly}
              empty="No exam categories yet."
            />
          )}
        </section>
        <section aria-labelledby="instructors-title">
          <h3 id="instructors-title" className="mb-1 font-semibold text-text">
            Instructors
          </h3>
          <p className="mb-3 text-xs text-text-muted">
            Only instructors with a public profile are shown to students.
          </p>
          {instructors.isPending ? (
            <Spinner />
          ) : (
            <CheckList
              items={(instructors.data ?? []).map((i) => ({
                id: i.userId,
                label: i.profile ? localized(i.profile.displayName) : i.fullName,
                hint: !i.profile ? 'no profile' : i.profile.isPublic ? undefined : 'hidden',
              }))}
              selected={instructorIds}
              onToggle={toggle(setInstructorIds)}
              disabled={readOnly}
              empty="No staff yet."
            />
          )}
        </section>
      </div>
      <SectionFooter
        saving={s.saving}
        disabled={readOnly}
        onSave={() =>
          void s.save(
            () => api.put(`/admin/courses/${course.id}/links`, { examNodeIds, instructorIds }),
            'Links saved',
          )
        }
      />
    </Card>
  );
}

// ───────────── Publishing ─────────────

function PublishingCard({ course }: { course: CourseDetail }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canPublish = can('courses:publish');
  const s = useSection(course.id);
  const [status, setStatus] = useState<PublishStatus>(course.status);
  const [when, setWhen] = useState(isoToNepalLocal(course.publishAt));
  const [deleting, setDeleting] = useState(false);
  const options: PublishStatus[] = canPublish
    ? ['draft', 'in_review', 'scheduled', 'published', 'archived']
    : ['draft', 'in_review'];
  const apply = () => {
    const publishAt = status === 'scheduled' ? nepalLocalToIso(when) : null;
    if (status === 'scheduled' && !publishAt) return s.setError('Choose the date and time to publish');
    void s.save(
      () => api.put(`/admin/courses/${course.id}/publishing`, { status, publishAt }),
      `Status: ${STATUS_LABEL[status]}`,
    );
  };
  return (
    <Card>
      <CardHeader
        title="Publishing"
        description={<StatusBadge status={course.status} publishAt={course.publishAt} />}
      />
      <div className="flex flex-col gap-4 p-5">
        {s.error ? <Alert tone="danger" title={s.error} /> : null}
        <Field label="Course status">
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
        {status === 'scheduled' ? (
          <Field
            label="Publish at (Nepal time)"
            hint={when ? formatDateTimeBs(nepalLocalToIso(when)) : undefined}
          >
            {(a) => (
              <Input {...a} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            )}
          </Field>
        ) : null}
        <Button
          onClick={apply}
          loading={s.saving}
          disabled={status === course.status && status !== 'scheduled'}
        >
          Update status
        </Button>
        <p className="text-xs text-text-muted">
          {course.activeStudents} student{course.activeStudents === 1 ? '' : 's'} with access. Archived
          courses stay available to them until their access ends.
        </p>
        {canPublish ? (
          <Button variant="ghost" className="text-danger" onClick={() => setDeleting(true)}>
            <Trash2 /> Delete course
          </Button>
        ) : null}
      </div>
      {deleting ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(false)}
          title="Delete this course?"
          description={
            course.activeStudents > 0
              ? `${course.activeStudents} students still have access, so it cannot be deleted. Archive it instead.`
              : 'It disappears from the catalog. Subjects and their content are kept.'
          }
          confirmLabel="Delete course"
          onConfirm={async () => {
            await api.delete(`/admin/courses/${course.id}`);
            await qc.invalidateQueries({ queryKey: ['courses'] });
            toast.success('Course deleted');
            void navigate({ to: '/courses' });
          }}
        />
      ) : null}
    </Card>
  );
}

export function CoursePage() {
  const { courseId } = useParams({ from: '/app/courses/$courseId' });
  const { tab } = useSearch({ from: '/app/courses/$courseId' });
  const navigate = useNavigate();
  const { can } = useAuth();
  const course = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => api.get<CourseDetail>(`/admin/courses/${courseId}`),
  });
  if (course.isPending) return <Spinner />;
  if (course.isError) return <ErrorState error={course.error} onRetry={() => void course.refetch()} />;
  const c = course.data;
  const live = c.status === 'published' || c.status === 'scheduled';
  const lockedLive = live && !can('courses:publish');
  const editReadOnly = !can('courses:edit') || lockedLive;
  const active: Tab = tab ?? 'details';
  // Remount sections when the server copy changes so forms show saved values.
  const key = JSON.stringify([
    c.status,
    c.pricing,
    c.subjects.length,
    c.examNodes.length,
    c.instructors.length,
    c.slug,
  ]);
  return (
    <>
      <Link
        to="/courses"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" /> Courses
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {c.thumbnailUrl ? (
          <img src={c.thumbnailUrl} alt="" className="h-12 w-20 rounded-sm object-cover" />
        ) : null}
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold leading-8 tracking-tight text-text">
            {c.title.en ?? c.title.ne}
          </h1>
          <p className="text-sm text-text-muted">/{c.slug}</p>
        </div>
        <StatusBadge status={c.status} publishAt={c.publishAt} />
      </div>
      {lockedLive ? (
        <div className="mb-4">
          <Alert tone="warning" title="This course is live">
            Ask someone who can publish courses to change it, or to move it back to draft first.
          </Alert>
        </div>
      ) : null}
      <div
        className="mb-4 flex gap-1 overflow-x-auto border-b border-border"
        role="tablist"
        aria-label="Course sections"
      >
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            onClick={() =>
              void navigate({
                to: '/courses/$courseId',
                params: { courseId },
                search: { tab: id },
                replace: true,
              })
            }
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold',
              active === id
                ? 'border-primary text-text'
                : 'border-transparent text-text-muted hover:text-text',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0" role="tabpanel">
          {active === 'details' ? <DetailsSection key={key} course={c} readOnly={editReadOnly} /> : null}
          {active === 'pricing' ? (
            <PricingSection key={key} course={c} readOnly={!can('courses:pricing') || lockedLive} />
          ) : null}
          {active === 'subjects' ? <SubjectsSection key={key} course={c} readOnly={editReadOnly} /> : null}
          {active === 'links' ? <LinksSection key={key} course={c} readOnly={editReadOnly} /> : null}
        </div>
        <div>
          <PublishingCard key={key} course={c} />
        </div>
      </div>
    </>
  );
}
