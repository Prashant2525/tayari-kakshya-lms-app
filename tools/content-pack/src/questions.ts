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

/** One correct answer. `answer` is the index of the correct option. */
export function mcq(
  stem: string,
  choices: string[],
  answer: number,
  explanation: string,
  difficulty: Difficulty = 'medium',
): PackQuestion {
  return {
    difficulty,
    content: {
      type: 'single_choice',
      stem: en(stem),
      options: options(choices),
      correctOptionId: ids[answer]!,
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
  return {
    difficulty,
    content: {
      type: 'multiple_choice',
      stem: en(stem),
      options: options(choices),
      correctOptionIds: answers.map((a) => ids[a]!),
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

/** Pairs in order (left → right); `extra` adds distractors on the right. The right side is shuffled by the app. */
export function match(
  stem: string,
  pairs: Array<[string, string]>,
  explanation: string,
  difficulty: Difficulty = 'medium',
  extra: string[] = [],
): PackQuestion {
  const left = pairs.map(([l], i) => ({ id: `l${i + 1}`, content: en(l) }));
  const right = [...pairs.map(([, r]) => r), ...extra].map((r, i) => ({ id: `r${i + 1}`, content: en(r) }));
  return {
    difficulty,
    content: {
      type: 'match',
      stem: en(stem),
      left,
      right,
      pairs: Object.fromEntries(pairs.map((_, i) => [`l${i + 1}`, `r${i + 1}`])),
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
