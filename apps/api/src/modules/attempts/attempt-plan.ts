import { randomInt } from 'node:crypto';
import type { LocalizedText, QuestionContent } from '@tk/contracts';
import type { QuestionType } from '@tk/domain';

/**
 * What an attempt asks, fixed when it starts (stored in `attempts.plan`): later edits to the assessment or its
 * questions never change a running or finished attempt. Marks are centimarks.
 */
export interface PlannedQuestion {
  questionId: string;
  versionId: string;
  type: QuestionType;
  marks: number;
  /** 0 when the assessment does not use negative marking. */
  negativeMarks: number;
  /**
   * With shuffled options: the order the student sees — the options of a choice question, or the right-hand column
   * of a match question (Phase 16: it used to keep its written order, often the answer order).
   */
  optionOrder: string[] | null;
}

export interface PlannedSection {
  sectionId: string;
  title: LocalizedText | null;
  questions: PlannedQuestion[];
}

export interface AttemptPlan {
  sections: PlannedSection[];
}

/** Fisher–Yates with a cryptographic source (students cannot predict orders or picks). */
export function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** The order for one attempt when options are shuffled: choice options, or a match question's right-hand column. */
export function optionOrderFor(content: QuestionContent, shuffle: boolean): string[] | null {
  if (!shuffle) return null;
  if (content.type === 'single_choice' || content.type === 'multiple_choice') {
    return shuffled(content.options.map((o) => o.id));
  }
  if (content.type === 'match') return shuffled(content.right.map((r) => r.id));
  return null;
}

export function planQuestions(plan: AttemptPlan): PlannedQuestion[] {
  return plan.sections.flatMap((s) => s.questions);
}

/** Puts choices in the planned order (unknown ids keep their place at the end). */
export function ordered<T extends { id: string }>(choices: T[], order: string[] | null): T[] {
  if (!order) return choices;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...choices].sort((a, b) => (rank.get(a.id) ?? order.length) - (rank.get(b.id) ?? order.length));
}
