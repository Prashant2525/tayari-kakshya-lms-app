import { QuestionContent, type QuestionType } from '@tk/contracts';
import { BASE_LISTS } from './import-template.js';

/**
 * Converts one spreadsheet row (template `tk-questions-v1`) into question content + metadata. Pure: names of
 * subjects, topics, categories and papers are returned as text for the importer to resolve against the database.
 * Every problem names the column, so the import preview can point at the exact cell.
 */
export interface RowProblem {
  column: string;
  message: string;
}

export interface ParsedRow {
  ref: string | null;
  subject: string;
  chapter: string | null;
  topic: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  marks: number;
  negativeMarks: number;
  accessLevel: 'free' | 'premium';
  language: 'en' | 'ne' | 'both';
  status: 'draft' | 'in_review';
  tags: string[];
  passageRef: string | null;
  source: { categoryPath: string[]; paper: string | null; yearBs: number | null; note: string | null } | null;
  content: QuestionContent;
}

type Row = Record<string, string | number | boolean | null | undefined>;

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

/** Plain text (with line breaks) → one rich-text document; blank → undefined. */
export function textDoc(value: string | undefined): Record<string, unknown> | undefined {
  const text = (value ?? '').replace(/\r\n?/g, '\n').trim();
  if (!text) return undefined;
  return {
    type: 'doc',
    content: text.split(/\n{2,}/).map((para) => {
      const lines = para.split('\n');
      return {
        type: 'paragraph',
        content: lines.flatMap((line, i) => [
          ...(i > 0 ? [{ type: 'hardBreak' }] : []),
          ...(line ? [{ type: 'text', text: line }] : []),
        ]),
      };
    }),
  };
}

function localized(en: string | undefined, ne: string | undefined) {
  const e = textDoc(en);
  const n = textDoc(ne);
  return { ...(e ? { en: e } : {}), ...(n ? { ne: n } : {}) };
}

const optionalLocalized = (en: string | undefined, ne: string | undefined) => {
  const v = localized(en, ne);
  return Object.keys(v).length ? v : null;
};

/** Cell → trimmed string (numbers and booleans as Excel shows them). */
function cell(row: Row, key: string): string {
  const v = row[key];
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v).trim();
}

function numberOf(value: string): number | null {
  if (!value) return null;
  const n = Number(value.replace(/,/g, ''));
  return Number.isFinite(n) ? n : Number.NaN;
}

/** "1) Kathmandu\n2) Pokhara" → { '1': 'Kathmandu', '2': 'Pokhara' } */
function numberedLines(value: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of value.split(/\r?\n/)) {
    const m = /^\s*(\d{1,2})\s*[).:-]\s*(.+?)\s*$/.exec(line);
    if (m?.[1] && m[2]) out.set(m[1], m[2]);
  }
  return out;
}

export function parseQuestionRow(row: Row): { value: ParsedRow | null; problems: RowProblem[] } {
  const problems: RowProblem[] = [];
  const need = (column: string, message: string) => problems.push({ column, message });

  const type = cell(row, 'type') as QuestionType;
  if (!BASE_LISTS.types.includes(type)) need('type', `Use one of: ${BASE_LISTS.types.join(', ')}`);
  const subject = cell(row, 'subject');
  if (!subject) need('subject', 'Enter the subject name');
  const difficulty = cell(row, 'difficulty').toLowerCase();
  if (!BASE_LISTS.difficulty.includes(difficulty)) need('difficulty', 'Use easy, medium or hard');
  const access = cell(row, 'access').toLowerCase();
  if (!BASE_LISTS.access.includes(access)) need('access', 'Use free or premium');
  const language = (cell(row, 'language') || 'both').toLowerCase();
  if (!BASE_LISTS.language.includes(language)) need('language', 'Use both, en or ne');
  const status = (cell(row, 'status') || 'draft').toLowerCase();
  if (!BASE_LISTS.status.includes(status)) need('status', 'Use draft or in_review');

  const marks = numberOf(cell(row, 'marks'));
  if (marks === null || Number.isNaN(marks) || marks < 0) need('marks', 'Enter the marks as a number');
  const negative = numberOf(cell(row, 'negative_marks')) ?? 0;
  if (Number.isNaN(negative) || negative < 0) need('negative_marks', 'Enter a number or leave blank');
  else if (marks !== null && !Number.isNaN(marks) && negative > marks) {
    need('negative_marks', 'Negative marks cannot be more than the marks');
  }
  const chapter = cell(row, 'chapter') || null;
  const topic = cell(row, 'topic') || null;
  if (topic && !chapter) need('chapter', 'Give the chapter when a topic is given');

  // ── Content by type ──
  const stem = localized(cell(row, 'question_en'), cell(row, 'question_ne'));
  if (!Object.keys(stem).length) need('question_en', 'Enter the question in English or Nepali');
  const explanation = optionalLocalized(cell(row, 'explanation_en'), cell(row, 'explanation_ne'));
  const options = LETTERS.map((l) => ({
    id: l,
    content: localized(cell(row, `option_${l}_en`), cell(row, `option_${l}_ne`)),
  })).filter((o) => Object.keys(o.content).length > 0);
  const correct = cell(row, 'correct');
  let content: Record<string, unknown> | null = null;

  switch (type) {
    case 'single_choice': {
      const id = correct.toLowerCase();
      if (options.length < 2) need('option_a_en', 'Give at least two options');
      if (!/^[a-f]$/.test(id)) need('correct', 'Enter one letter, e.g. c');
      else if (!options.some((o) => o.id === id)) need('correct', `Option ${id.toUpperCase()} is empty`);
      content = { type, stem, options, correctOptionId: id, explanation };
      break;
    }
    case 'multiple_choice': {
      const ids = [
        ...new Set(
          correct
            .toLowerCase()
            .split(/[\s,;]+/)
            .filter(Boolean),
        ),
      ];
      if (options.length < 2) need('option_a_en', 'Give at least two options');
      if (!ids.length || ids.some((id) => !/^[a-f]$/.test(id)))
        need('correct', 'Enter letters separated by commas, e.g. a,c');
      else if (ids.some((id) => !options.some((o) => o.id === id)))
        need('correct', 'A correct letter points at an empty option');
      content = { type, stem, options, correctOptionIds: ids, explanation };
      break;
    }
    case 'true_false': {
      const v = correct.toUpperCase();
      const map: Record<string, boolean> = {
        TRUE: true,
        FALSE: false,
        T: true,
        F: false,
        YES: true,
        NO: false,
        सही: true,
        गलत: false,
      };
      if (!(v in map) && !(correct in map)) need('correct', 'Enter TRUE or FALSE');
      content = { type, stem, correct: map[v] ?? map[correct], explanation };
      break;
    }
    case 'fill_blank': {
      const raw = cell(row, 'blank_answers');
      const sensitive = new Set(
        cell(row, 'case_sensitive_blanks')
          .toLowerCase()
          .split(/[\s,;]+/)
          .filter(Boolean),
      );
      const blanks = raw
        .split(/;|\n/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const m = /^([a-z0-9]{1,8})\s*=\s*(.+)$/i.exec(part);
          if (!m?.[1] || !m[2]) return null;
          const id = m[1].toLowerCase();
          return {
            id,
            accepted: m[2]
              .split('|')
              .map((a) => a.trim())
              .filter(Boolean),
            caseSensitive: sensitive.has(id),
          };
        });
      if (!blanks.length || blanks.some((b) => !b)) need('blank_answers', 'Use b1=answer|other; b2=answer');
      content = { type, stem, blanks: blanks.filter(Boolean), explanation };
      break;
    }
    case 'match': {
      const rightEn = numberedLines(cell(row, 'match_right_en'));
      const rightNe = numberedLines(cell(row, 'match_right_ne'));
      const keys = [...new Set([...rightEn.keys(), ...rightNe.keys()])].sort((a, b) => Number(a) - Number(b));
      const right = keys.map((k) => ({ id: `r${k}`, content: localized(rightEn.get(k), rightNe.get(k)) }));
      const left = options.map((o) => ({
        ...o,
        id: `l${LETTERS.indexOf(o.id as (typeof LETTERS)[number]) + 1}`,
      }));
      const pairs: Record<string, string> = {};
      for (const part of cell(row, 'match_pairs')
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean)) {
        const m = /^([a-f])\s*=\s*(\d{1,2})$/i.exec(part);
        if (!m?.[1] || !m[2]) {
          need('match_pairs', `Could not read "${part}" — use a=2, b=1`);
          continue;
        }
        pairs[`l${LETTERS.indexOf(m[1].toLowerCase() as (typeof LETTERS)[number]) + 1}`] = `r${m[2]}`;
      }
      if (left.length < 2) need('option_a_en', 'Give at least two left-column items in the option columns');
      if (right.length < 2) need('match_right_en', 'Give at least two right-column items, numbered 1), 2)…');
      content = { type, stem, left, right, pairs, explanation };
      break;
    }
    case 'numeric': {
      const value = numberOf(correct);
      if (value === null || Number.isNaN(value)) need('correct', 'Enter the correct number');
      const tolerance = numberOf(cell(row, 'tolerance')) ?? 0;
      if (Number.isNaN(tolerance) || tolerance < 0)
        need('tolerance', 'Enter a positive number or leave blank');
      content = {
        type,
        stem,
        value,
        tolerance,
        unit: optionalLocalizedText(cell(row, 'unit_en'), cell(row, 'unit_ne')),
        explanation,
      };
      break;
    }
    case 'subjective': {
      const model = localized(cell(row, 'model_answer_en'), cell(row, 'model_answer_ne'));
      if (!Object.keys(model).length) need('model_answer_en', 'Enter a model answer');
      content = { type, stem, modelAnswer: model, explanation };
      break;
    }
  }

  // Final check with the same schema the API uses (catches anything the friendly checks missed).
  let parsedContent: QuestionContent | null = null;
  if (content && !problems.length) {
    const r = QuestionContent.safeParse(content);
    if (r.success) parsedContent = r.data;
    else for (const issue of r.error.issues) need(columnFor(issue.path), issue.message);
  }

  const yearText = cell(row, 'pyq_year_bs');
  const year = numberOf(yearText);
  if (yearText && (year === null || !Number.isInteger(year) || year < 2000 || year > 2100)) {
    need('pyq_year_bs', 'Enter a BS year between 2000 and 2100');
  }
  const categoryPath = cell(row, 'pyq_category')
    .split('>')
    .map((s) => s.trim())
    .filter(Boolean);
  const paper = cell(row, 'pyq_paper') || null;
  const hasSource = categoryPath.length > 0 || paper || yearText;
  const tags = cell(row, 'tags')
    .split(/[,;\n]+/)
    .map((t) => t.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  if (tags.length > 30) need('tags', 'At most 30 tags');
  if (tags.some((t) => t.length > 50)) need('tags', 'Each tag can have at most 50 characters');

  if (problems.length || !parsedContent) return { value: null, problems };
  return {
    value: {
      ref: cell(row, 'ref') || null,
      subject,
      chapter,
      topic,
      difficulty: difficulty as ParsedRow['difficulty'],
      marks: marks as number,
      negativeMarks: negative,
      accessLevel: access as ParsedRow['accessLevel'],
      language: language as ParsedRow['language'],
      status: status as ParsedRow['status'],
      tags,
      passageRef: cell(row, 'passage_ref') || null,
      source: hasSource
        ? {
            categoryPath,
            paper,
            yearBs: yearText ? (year as number) : null,
            note: cell(row, 'pyq_note') || null,
          }
        : null,
      content: parsedContent,
    },
    problems,
  };
}

function optionalLocalizedText(en: string, ne: string) {
  if (!en && !ne) return null;
  return { ...(en ? { en } : {}), ...(ne ? { ne } : {}) };
}

/** Maps a schema issue path back to the template column a person should fix. */
function columnFor(path: PropertyKey[]): string {
  const [first, index] = path;
  if (first === 'stem') return 'question_en';
  if (first === 'options' && typeof index === 'number') return `option_${LETTERS[index] ?? 'a'}_en`;
  if (first === 'left' && typeof index === 'number') return `option_${LETTERS[index] ?? 'a'}_en`;
  if (first === 'right') return 'match_right_en';
  if (first === 'pairs') return 'match_pairs';
  if (first === 'blanks') return 'blank_answers';
  if (first === 'modelAnswer') return 'model_answer_en';
  if (first === 'explanation') return 'explanation_en';
  return 'correct';
}
