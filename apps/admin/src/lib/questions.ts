import {
  QuestionInput,
  type Difficulty,
  type LocalizedText,
  type PublishStatus,
  type QuestionContent,
  type QuestionType,
} from '@tk/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { isEmptyDoc, type JsonNode } from './rich-doc';

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  single_choice: 'Single choice',
  multiple_choice: 'Multiple answers',
  true_false: 'True / false',
  fill_blank: 'Fill in the blank',
  match: 'Match the following',
  numeric: 'Numerical',
  subjective: 'Subjective',
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export interface QuestionRow {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  status: PublishStatus;
  accessLevel: 'free' | 'premium';
  isPyq: boolean;
  preview: string;
  subject: LocalizedText;
  topic: LocalizedText | null;
  tags: string[];
  defaultMarks: number;
  openReports: number;
  deletedAt: string | null;
  updatedAt: string;
}

export interface QuestionSource {
  examNodeId: string | null;
  examNodeName?: LocalizedText | null;
  paperId: string | null;
  paperName?: LocalizedText | null;
  yearBs: number | null;
  note: string | null;
}

export interface QuestionDetail {
  id: string;
  type: QuestionType;
  subject: { id: string; name: LocalizedText };
  topic: { id: string; title: LocalizedText } | null;
  group: { id: string; title: LocalizedText | null } | null;
  difficulty: Difficulty;
  defaultMarks: number;
  defaultNegativeMarks: number;
  language: 'en' | 'ne' | 'both';
  accessLevel: 'free' | 'premium';
  isPyq: boolean;
  status: PublishStatus;
  tags: string[];
  sources: QuestionSource[];
  content: QuestionContent | null;
  versionNo: number;
  versionCount: number;
  openReports: number;
  updatedAt: string;
}

/** Rich text in both languages, as edited (null = empty). */
export interface Bilingual {
  en: JsonNode | null;
  ne: JsonNode | null;
}
export interface ChoiceDraft extends Bilingual {
  id: string;
}

/** Editor state for a question of any type. Converted to `QuestionInput` on save. */
export interface QuestionDraft {
  subjectId: string;
  topicId: string;
  groupId: string;
  difficulty: Difficulty;
  marks: string;
  negativeMarks: string;
  accessLevel: 'free' | 'premium';
  language: 'en' | 'ne' | 'both';
  tags: string[];
  sources: Array<{ examNodeId: string; paperId: string; yearBs: string; note: string }>;
  stem: Bilingual;
  explanation: Bilingual;
  options: ChoiceDraft[];
  correct: string[];
  trueFalse: 'true' | 'false' | '';
  blanks: Array<{ id: string; accepted: string; caseSensitive: boolean }>;
  left: ChoiceDraft[];
  right: ChoiceDraft[];
  pairs: Record<string, string>;
  numericValue: string;
  tolerance: string;
  unitEn: string;
  unitNe: string;
  modelAnswer: Bilingual;
}

const empty = (): Bilingual => ({ en: null, ne: null });
const choice = (id: string): ChoiceDraft => ({ id, en: null, ne: null });

export function emptyDraft(type: QuestionType): QuestionDraft {
  return {
    subjectId: '',
    topicId: '',
    groupId: '',
    difficulty: 'medium',
    marks: '1',
    negativeMarks: '0',
    accessLevel: 'premium',
    language: 'both',
    tags: [],
    sources: [],
    stem: empty(),
    explanation: empty(),
    options: type === 'single_choice' || type === 'multiple_choice' ? ['a', 'b', 'c', 'd'].map(choice) : [],
    correct: [],
    trueFalse: '',
    blanks: [],
    left: type === 'match' ? ['l1', 'l2', 'l3'].map(choice) : [],
    right: type === 'match' ? ['r1', 'r2', 'r3'].map(choice) : [],
    pairs: {},
    numericValue: '',
    tolerance: '0',
    unitEn: '',
    unitNe: '',
    modelAnswer: empty(),
  };
}

const bi = (v: { en?: unknown; ne?: unknown } | null | undefined): Bilingual => ({
  en: (v?.en as JsonNode | undefined) ?? null,
  ne: (v?.ne as JsonNode | undefined) ?? null,
});

export function draftFromDetail(q: QuestionDetail): QuestionDraft {
  const d = emptyDraft(q.type);
  const c = q.content;
  Object.assign(d, {
    subjectId: q.subject.id,
    topicId: q.topic?.id ?? '',
    groupId: q.group?.id ?? '',
    difficulty: q.difficulty,
    marks: String(q.defaultMarks),
    negativeMarks: String(q.defaultNegativeMarks),
    accessLevel: q.accessLevel,
    language: q.language,
    tags: q.tags,
    sources: q.sources.map((s) => ({
      examNodeId: s.examNodeId ?? '',
      paperId: s.paperId ?? '',
      yearBs: s.yearBs?.toString() ?? '',
      note: s.note ?? '',
    })),
  });
  if (!c) return d;
  d.stem = bi(c.stem);
  d.explanation = bi(c.explanation);
  switch (c.type) {
    case 'single_choice':
    case 'multiple_choice':
      d.options = c.options.map((o) => ({ id: o.id, ...bi(o.content) }));
      d.correct = c.type === 'single_choice' ? [c.correctOptionId] : c.correctOptionIds;
      break;
    case 'true_false':
      d.trueFalse = c.correct ? 'true' : 'false';
      break;
    case 'fill_blank':
      d.blanks = c.blanks.map((b) => ({
        id: b.id,
        accepted: b.accepted.join('\n'),
        caseSensitive: b.caseSensitive,
      }));
      break;
    case 'match':
      d.left = c.left.map((o) => ({ id: o.id, ...bi(o.content) }));
      d.right = c.right.map((o) => ({ id: o.id, ...bi(o.content) }));
      d.pairs = { ...c.pairs };
      break;
    case 'numeric':
      d.numericValue = String(c.value);
      d.tolerance = String(c.tolerance);
      d.unitEn = c.unit?.en ?? '';
      d.unitNe = c.unit?.ne ?? '';
      break;
    case 'subjective':
      d.modelAnswer = bi(c.modelAnswer);
      break;
  }
  return d;
}

/** Drops empty languages; an all-empty value becomes `{}`, which the schema rejects with a clear message. */
function loc(v: Bilingual): Record<string, JsonNode> {
  return {
    ...(isEmptyDoc(v.en) ? {} : { en: v.en as JsonNode }),
    ...(isEmptyDoc(v.ne) ? {} : { ne: v.ne as JsonNode }),
  };
}
const optionalLoc = (v: Bilingual) => (isEmptyDoc(v.en) && isEmptyDoc(v.ne) ? null : loc(v));
const choices = (list: ChoiceDraft[]) => list.map((o) => ({ id: o.id, content: loc(o) }));
const num = (v: string) => (v.trim() === '' ? Number.NaN : Number(v));

export function draftToInput(type: QuestionType, d: QuestionDraft): unknown {
  const base = { stem: loc(d.stem), explanation: optionalLoc(d.explanation) };
  let content: Record<string, unknown>;
  switch (type) {
    case 'single_choice':
      content = { type, ...base, options: choices(d.options), correctOptionId: d.correct[0] ?? '' };
      break;
    case 'multiple_choice':
      content = { type, ...base, options: choices(d.options), correctOptionIds: d.correct };
      break;
    case 'true_false':
      content = { type, ...base, correct: d.trueFalse === '' ? undefined : d.trueFalse === 'true' };
      break;
    case 'fill_blank':
      content = {
        type,
        ...base,
        blanks: d.blanks.map((b) => ({
          id: b.id,
          accepted: b.accepted
            .split('\n')
            .map((a) => a.trim())
            .filter(Boolean),
          caseSensitive: b.caseSensitive,
        })),
      };
      break;
    case 'match':
      content = { type, ...base, left: choices(d.left), right: choices(d.right), pairs: d.pairs };
      break;
    case 'numeric': {
      const unit =
        d.unitEn.trim() || d.unitNe.trim()
          ? {
              ...(d.unitEn.trim() ? { en: d.unitEn.trim() } : {}),
              ...(d.unitNe.trim() ? { ne: d.unitNe.trim() } : {}),
            }
          : null;
      content = { type, ...base, value: num(d.numericValue), tolerance: num(d.tolerance || '0'), unit };
      break;
    }
    case 'subjective':
      content = { type, ...base, modelAnswer: loc(d.modelAnswer) };
      break;
  }
  return {
    subjectId: d.subjectId,
    topicId: d.topicId || null,
    groupId: d.groupId || null,
    difficulty: d.difficulty,
    defaultMarks: num(d.marks),
    defaultNegativeMarks: num(d.negativeMarks || '0'),
    language: d.language,
    accessLevel: d.accessLevel,
    tags: d.tags,
    sources: d.sources.map((s) => ({
      examNodeId: s.examNodeId || null,
      paperId: s.paperId || null,
      yearBs: s.yearBs.trim() ? Number(s.yearBs) : null,
      note: s.note.trim() || null,
    })),
    content,
  };
}

const FIELD_LABEL: Record<string, string> = {
  subjectId: 'Subject',
  defaultMarks: 'Marks',
  defaultNegativeMarks: 'Negative marks',
  stem: 'Question',
  options: 'Options',
  correct: 'Correct answer',
  correctOptionId: 'Correct answer',
  correctOptionIds: 'Correct answers',
  blanks: 'Blanks',
  left: 'Left column',
  right: 'Right column',
  pairs: 'Pairs',
  value: 'Answer value',
  tolerance: 'Tolerance',
  modelAnswer: 'Model answer',
  sources: 'Previous-year sources',
};

/** Client-side check with the same schema the API uses; returns readable problems ([] = valid). */
export function validateDraft(type: QuestionType, d: QuestionDraft): string[] {
  const result = QuestionInput.safeParse(draftToInput(type, d));
  if (result.success) {
    const marks = Number(d.marks);
    if (Number(d.negativeMarks || 0) > marks) return ['Negative marks: cannot be more than the marks'];
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const issue of result.error.issues) {
    const path = issue.path.filter((p) => typeof p === 'string') as string[];
    const key = path.find((p) => FIELD_LABEL[p]) ?? path.at(-1) ?? '';
    let message = issue.message;
    if (key === 'subjectId') message = 'Choose a subject';
    else if (/Required|Invalid input|expected/i.test(message)) message = 'Fill this in';
    const text = `${FIELD_LABEL[key] ?? 'Question'}: ${message}`;
    if (!seen.has(text)) {
      seen.add(text);
      out.push(text);
    }
  }
  return out;
}

/** Next free id with a prefix: a, b, c… for options; l1/r1/b1 for match items and blanks. */
export function nextId(existing: string[], prefix: 'letter' | 'l' | 'r' | 'b'): string {
  if (prefix === 'letter') {
    for (const ch of 'abcdefghijklmnopqrstuvwxyz') if (!existing.includes(ch)) return ch;
    return `o${existing.length + 1}`;
  }
  let n = 1;
  while (existing.includes(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** Blank ids used in the stem text (`[[b1]]`), in order of appearance. */
export function blanksInStem(stem: Bilingual): string[] {
  const text = JSON.stringify([stem.en, stem.ne]);
  return [...new Set([...text.matchAll(/\[\[([a-z0-9]{1,8})\]\]/g)].map((m) => m[1] as string))];
}

interface AppConfig {
  enabledQuestionTypes?: QuestionType[];
  questionTypeLabels?: Partial<Record<QuestionType, LocalizedText>>;
}

/** Question types the CMS allows (setting `questions.types`) and their display names. */
export function useQuestionTypes() {
  const config = useQuery({
    queryKey: ['app-config'],
    queryFn: () => api.get<AppConfig>('/app/config'),
    staleTime: 60_000,
  });
  const all = Object.keys(QUESTION_TYPE_LABEL) as QuestionType[];
  const labels = config.data?.questionTypeLabels ?? {};
  return {
    isPending: config.isPending,
    enabled: config.data?.enabledQuestionTypes ?? all,
    label: (type: QuestionType) => labels[type]?.en ?? labels[type]?.ne ?? QUESTION_TYPE_LABEL[type],
  };
}
