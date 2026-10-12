import { md, type Doc } from './markdown.ts';
import type { Difficulty, PackQuestion } from './types.ts';

/**
 * Question helpers: each builds the `QuestionContent` the question bank stores (English text; the rich-text fields
 * are `{ en: doc }`). Options are Markdown; option ids are a, b, c, … in order.
 */
const en = (text: string): { en: Doc } => ({ en: md(text) });
const ids = 'abcdefghij';
const options = (choices: string[]) => choices.map((c, i) => ({ id: ids[i]!, content: en(c) }));
const explain = (text?: string) => (text ? en(text) : null);

/**
 * A fixed, scrambled order for a question's choices (Phase 16): the pack is written with the answer usually second,
 * which students would learn. The order comes from the question's own text, so it never changes between imports.
 */
export function scrambledOrder(seed: string, n: number): number[] {
  // FNV-1a hash of the seed, then a small deterministic generator (mulberry32) for Fisher–Yates.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  let state = h >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/** One correct answer. `answer` is the index of the correct option. */
export function mcq(
  stem: string,
  choices: string[],
  answer: number,
  explanation: string,
  difficulty: Difficulty = 'medium',
): PackQuestion {
  const order = scrambledOrder(stem, choices.length);
  return {
    difficulty,
    content: {
      type: 'single_choice',
      stem: en(stem),
      options: options(order.map((i) => choices[i]!)),
      correctOptionId: ids[order.indexOf(answer)]!,
      explanation: explain(explanation),
    },
  };
}

/** Several correct answers (indexes). */
export function multi(
  stem: string,
  choices: string[],
  answers: number[],
  explanation: string,
  difficulty: Difficulty = 'medium',
): PackQuestion {
  const order = scrambledOrder(stem, choices.length);
  return {
    difficulty,
    content: {
      type: 'multiple_choice',
      stem: en(stem),
      options: options(order.map((i) => choices[i]!)),
      correctOptionIds: answers.map((a) => ids[order.indexOf(a)]!).sort(),
      explanation: explain(explanation),
    },
  };
}

export function tf(
  statement: string,
  correct: boolean,
  explanation: string,
  difficulty: Difficulty = 'easy',
): PackQuestion {
  return {
    difficulty,
    content: { type: 'true_false', stem: en(statement), correct, explanation: explain(explanation) },
  };
}

/** Blanks are written `[[b1]]` in the stem; `accepted` lists the answers taken for each blank. */
export function blank(
  stem: string,
  accepted: Record<string, string[]>,
  explanation: string,
  difficulty: Difficulty = 'medium',
): PackQuestion {
  return {
    difficulty,
    content: {
      type: 'fill_blank',
      stem: en(stem),
      blanks: Object.entries(accepted).map(([id, answers]) => ({
        id,
        accepted: answers,
        caseSensitive: false,
      })),
      explanation: explain(explanation),
    },
  };
}

/**
 * Pairs in order (left → right); `extra` adds distractors on the right. The right-hand column is stored in a scrambled
 * order (practice shows it as stored; assessments with "shuffle options" reorder it per attempt).
 */
export function match(
  stem: string,
  pairs: Array<[string, string]>,
  explanation: string,
  difficulty: Difficulty = 'medium',
  extra: string[] = [],
): PackQuestion {
  const left = pairs.map(([l], i) => ({ id: `l${i + 1}`, content: en(l) }));
  const rights = [...pairs.map(([, r]) => r), ...extra];
  const order = scrambledOrder(stem, rights.length);
  // order[k] = which written right item sits in position k; its id is r(k+1).
  const right = order.map((w, k) => ({ id: `r${k + 1}`, content: en(rights[w]!) }));
  const idOf = (written: number) => `r${order.indexOf(written) + 1}`;
  return {
    difficulty,
    content: {
      type: 'match',
      stem: en(stem),
      left,
      right,
      pairs: Object.fromEntries(pairs.map((_, i) => [`l${i + 1}`, idOf(i)])),
      explanation: explain(explanation),
    },
  };
}

export function num(
  stem: string,
  value: number,
  explanation: string,
  difficulty: Difficulty = 'medium',
  tolerance = 0,
): PackQuestion {
  return {
    difficulty,
    content: {
      type: 'numeric',
      stem: en(stem),
      value,
      tolerance,
      unit: null,
      explanation: explain(explanation),
    },
  };
}

/** Written answer, checked by the student against the model answer (practice; not used in timed tests). */
export function subj(stem: string, modelAnswer: string, difficulty: Difficulty = 'medium'): PackQuestion {
  return {
    difficulty,
    content: { type: 'subjective', stem: en(stem), modelAnswer: en(modelAnswer), explanation: null },
  };
}

/** Question types that are scored automatically (used in quizzes and tests). */
export const OBJECTIVE_TYPES = [
  'single_choice',
  'multiple_choice',
  'true_false',
  'fill_blank',
  'match',
  'numeric',
] as const;
