/**
 * Question scoring engine (D-016, D-021). Pure functions shared by the API (authoritative grading) and clients
 * (previews). Every rule that is a business choice — partial credit, negative marking, the score floor — comes in as
 * a parameter chosen in the CMS (D-044); nothing here decides it.
 *
 * Marks are integer **centimarks** (hundredths of a mark), so 0.25 negative marks is 25 and sums are exact.
 */

export type Centimarks = number;

export type AnswerKey =
  | { type: 'single_choice'; correctOptionId: string }
  | { type: 'multiple_choice'; correctOptionIds: string[] }
  | { type: 'true_false'; correct: boolean }
  | { type: 'fill_blank'; blanks: Array<{ id: string; accepted: string[]; caseSensitive: boolean }> }
  | { type: 'match'; pairs: Record<string, string> }
  | { type: 'numeric'; value: number; tolerance: number }
  | { type: 'subjective' };

export type QuestionType = AnswerKey['type'];

export type AnswerResponse =
  | { type: 'single_choice'; optionId: string | null }
  | { type: 'multiple_choice'; optionIds: string[] }
  | { type: 'true_false'; value: boolean | null }
  | { type: 'fill_blank'; blanks: Record<string, string> }
  | { type: 'match'; pairs: Record<string, string> }
  | { type: 'numeric'; value: number | null }
  | { type: 'subjective'; text: string };

/** How partially correct answers earn marks. Chosen per assessment in the CMS. */
export interface PartialCreditRules {
  /**
   * `all_or_nothing`: exactly the correct set earns full marks; anything else answered is wrong.
   * `partial_if_no_wrong`: choosing any incorrect option is wrong; otherwise marks × (correct chosen ÷ correct total).
   */
  multipleChoice: 'all_or_nothing' | 'partial_if_no_wrong';
  /** `all_or_nothing`, or `per_pair`: marks × (correct pairs ÷ pairs); no correct pair at all is wrong. */
  match: 'all_or_nothing' | 'per_pair';
  /** `all_or_nothing`, or `per_blank`: marks × (correct blanks ÷ blanks); no correct blank at all is wrong. */
  fillBlank: 'all_or_nothing' | 'per_blank';
}

export interface MarkScheme {
  marks: Centimarks;
  /** Deducted for a wrong answer (0 = no negative marking). Never applied to skipped or partially correct answers. */
  negativeMarks: Centimarks;
}

/** `pending` = needs a person (subjective answers); it counts 0 until graded. */
export type Outcome = 'correct' | 'partial' | 'wrong' | 'skipped' | 'pending';

export interface QuestionScore {
  outcome: Outcome;
  awarded: Centimarks;
}

export class ScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScoringError';
  }
}

const DEVANAGARI_DIGITS = /[०-९]/g;

/**
 * Text normalisation for fill-in-the-blank: Unicode NFC, Devanagari digits as ASCII digits, trimmed, inner
 * whitespace collapsed, and lower-cased unless the blank is case sensitive.
 */
export function normalizeBlank(value: string, caseSensitive: boolean): string {
  const text = value
    .normalize('NFC')
    .replace(DEVANAGARI_DIGITS, (d) => String(d.charCodeAt(0) - 0x0966))
    .trim()
    .replace(/\s+/g, ' ');
  return caseSensitive ? text : text.toLocaleLowerCase('en');
}

function assertScheme(scheme: MarkScheme): void {
  for (const [label, v] of [
    ['marks', scheme.marks],
    ['negativeMarks', scheme.negativeMarks],
  ] as const) {
    if (!Number.isSafeInteger(v) || v < 0) throw new ScoringError(`${label} must be non-negative centimarks`);
  }
}

/** marks × k ÷ n, rounded half up to whole centimarks. */
function fraction(marks: Centimarks, k: number, n: number): Centimarks {
  return Math.floor((marks * k * 2 + n) / (2 * n));
}

function graded(scheme: MarkScheme, correct: number, total: number, partialAllowed: boolean): QuestionScore {
  if (correct === total) return { outcome: 'correct', awarded: scheme.marks };
  if (partialAllowed && correct > 0)
    return { outcome: 'partial', awarded: fraction(scheme.marks, correct, total) };
  return wrong(scheme);
}

function wrong(scheme: MarkScheme): QuestionScore {
  // `0 - 0` rather than `-0`, so "no negative marking" stores a plain zero.
  return { outcome: 'wrong', awarded: 0 - scheme.negativeMarks };
}
const SKIPPED: QuestionScore = { outcome: 'skipped', awarded: 0 };

/** Scores one answer. `response` null means the question was not answered. */
export function scoreQuestion(
  key: AnswerKey,
  response: AnswerResponse | null,
  scheme: MarkScheme,
  rules: PartialCreditRules,
): QuestionScore {
  assertScheme(scheme);
  if (response && response.type !== key.type) {
    throw new ScoringError(`A ${response.type} answer cannot be scored against a ${key.type} question`);
  }
  switch (key.type) {
    case 'single_choice': {
      const r = response as Extract<AnswerResponse, { type: 'single_choice' }> | null;
      if (!r?.optionId) return SKIPPED;
      return r.optionId === key.correctOptionId
        ? { outcome: 'correct', awarded: scheme.marks }
        : wrong(scheme);
    }
    case 'true_false': {
      const r = response as Extract<AnswerResponse, { type: 'true_false' }> | null;
      if (r?.value === null || r?.value === undefined) return SKIPPED;
      return r.value === key.correct ? { outcome: 'correct', awarded: scheme.marks } : wrong(scheme);
    }
    case 'multiple_choice': {
      const r = response as Extract<AnswerResponse, { type: 'multiple_choice' }> | null;
      const chosen = new Set(r?.optionIds ?? []);
      if (chosen.size === 0) return SKIPPED;
      const correct = new Set(key.correctOptionIds);
      if (correct.size === 0)
        throw new ScoringError('A multiple-answer question needs at least one correct option');
      const anyWrong = [...chosen].some((id) => !correct.has(id));
      const hits = [...chosen].filter((id) => correct.has(id)).length;
      if (anyWrong) return wrong(scheme);
      return graded(scheme, hits, correct.size, rules.multipleChoice === 'partial_if_no_wrong');
    }
    case 'match': {
      const r = response as Extract<AnswerResponse, { type: 'match' }> | null;
      const given = Object.entries(r?.pairs ?? {}).filter(([, right]) => Boolean(right));
      if (given.length === 0) return SKIPPED;
      const total = Object.keys(key.pairs).length;
      if (total === 0) throw new ScoringError('A match question needs at least one pair');
      const hits = given.filter(([left, right]) => key.pairs[left] === right).length;
      return graded(scheme, hits, total, rules.match === 'per_pair');
    }
    case 'fill_blank': {
      const r = response as Extract<AnswerResponse, { type: 'fill_blank' }> | null;
      const answered = key.blanks.filter((b) => (r?.blanks[b.id] ?? '').trim() !== '');
      if (answered.length === 0) return SKIPPED;
      if (key.blanks.length === 0)
        throw new ScoringError('A fill-in-the-blank question needs at least one blank');
      const hits = key.blanks.filter((b) => {
        const given = normalizeBlank(r?.blanks[b.id] ?? '', b.caseSensitive);
        return given !== '' && b.accepted.some((a) => normalizeBlank(a, b.caseSensitive) === given);
      }).length;
      return graded(scheme, hits, key.blanks.length, rules.fillBlank === 'per_blank');
    }
    case 'numeric': {
      const r = response as Extract<AnswerResponse, { type: 'numeric' }> | null;
      if (r?.value === null || r?.value === undefined || !Number.isFinite(r.value)) return SKIPPED;
      if (!(key.tolerance >= 0)) throw new ScoringError('Tolerance must be zero or positive');
      // A tiny epsilon absorbs binary floating-point error (0.1 + 0.2 vs 0.3).
      const ok = Math.abs(r.value - key.value) <= key.tolerance + 1e-9;
      return ok ? { outcome: 'correct', awarded: scheme.marks } : wrong(scheme);
    }
    case 'subjective': {
      const r = response as Extract<AnswerResponse, { type: 'subjective' }> | null;
      return r?.text.trim() ? { outcome: 'pending', awarded: 0 } : SKIPPED;
    }
  }
}

/** Marks for a subjective answer graded by a person (or self-evaluated): 0 … full marks, in centimarks. */
export function gradeSubjective(awarded: Centimarks, scheme: MarkScheme): QuestionScore {
  assertScheme(scheme);
  if (!Number.isSafeInteger(awarded) || awarded < 0 || awarded > scheme.marks) {
    throw new ScoringError(`Awarded marks must be between 0 and ${scheme.marks / 100}`);
  }
  return { outcome: awarded === scheme.marks ? 'correct' : awarded === 0 ? 'wrong' : 'partial', awarded };
}

export interface AttemptTotals {
  score: Centimarks;
  maxScore: Centimarks;
  correct: number;
  partial: number;
  wrong: number;
  skipped: number;
  pending: number;
}

/**
 * Totals for an attempt. `floor: 'zero'` stops negative marking from taking the total below zero (a CMS choice per
 * assessment).
 */
export function totalAttempt(
  items: Array<{ scheme: MarkScheme; score: QuestionScore }>,
  floor: 'none' | 'zero',
): AttemptTotals {
  const t: AttemptTotals = {
    score: 0,
    maxScore: 0,
    correct: 0,
    partial: 0,
    wrong: 0,
    skipped: 0,
    pending: 0,
  };
  for (const { scheme, score } of items) {
    t.maxScore += scheme.marks;
    t.score += score.awarded;
    t[score.outcome] += 1;
  }
  if (floor === 'zero' && t.score < 0) t.score = 0;
  return t;
}

/** "12.5" / "-0.25" for display; centimarks → marks. */
export function formatMarks(centimarks: Centimarks): string {
  const sign = centimarks < 0 ? '-' : '';
  const abs = Math.abs(centimarks);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}${frac ? `.${String(frac).padStart(2, '0').replace(/0$/, '')}` : ''}`;
}

/** "0.25" → 25. Accepts up to two decimals; throws on anything else. */
export function marksToCentimarks(marks: number | string): Centimarks {
  const text = String(marks).trim();
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) throw new ScoringError(`Invalid marks "${text}" (use up to two decimals)`);
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}
