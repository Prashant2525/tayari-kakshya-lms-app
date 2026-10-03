import type { LocalizedRichDoc, LocalizedText, QuestionContent } from '@tk/contracts';

/**
 * Splits stored question content into what a student may always see (the question) and the answer key, model
 * answer and explanation. Locked (premium, not entitled) questions are sent without the answer part at all —
 * never "hidden on the client" (rule 5).
 */
export function splitQuestion(content: QuestionContent): {
  question: StudentQuestion;
  answer: StudentAnswer;
} {
  const explanation = content.explanation ?? null;
  switch (content.type) {
    case 'single_choice':
      return {
        question: { type: content.type, stem: content.stem, options: content.options },
        answer: { type: content.type, correctOptionId: content.correctOptionId, explanation },
      };
    case 'multiple_choice':
      return {
        question: { type: content.type, stem: content.stem, options: content.options },
        answer: { type: content.type, correctOptionIds: content.correctOptionIds, explanation },
      };
    case 'true_false':
      return {
        question: { type: content.type, stem: content.stem },
        answer: { type: content.type, correct: content.correct, explanation },
      };
    case 'fill_blank':
      return {
        question: {
          type: content.type,
          stem: content.stem,
          blanks: content.blanks.map((b) => ({ id: b.id })),
        },
        answer: { type: content.type, blanks: content.blanks, explanation },
      };
    case 'match':
      return {
        question: { type: content.type, stem: content.stem, left: content.left, right: content.right },
        answer: { type: content.type, pairs: content.pairs, explanation },
      };
    case 'numeric':
      return {
        question: { type: content.type, stem: content.stem, unit: content.unit ?? null },
        answer: { type: content.type, value: content.value, tolerance: content.tolerance, explanation },
      };
    case 'subjective':
      return {
        question: { type: content.type, stem: content.stem },
        answer: { type: content.type, modelAnswer: content.modelAnswer, explanation },
      };
  }
}

type Choice = { id: string; content: LocalizedRichDoc };

export type StudentQuestion =
  | { type: 'single_choice' | 'multiple_choice'; stem: LocalizedRichDoc; options: Choice[] }
  | { type: 'true_false' | 'subjective'; stem: LocalizedRichDoc }
  | { type: 'fill_blank'; stem: LocalizedRichDoc; blanks: Array<{ id: string }> }
  | { type: 'match'; stem: LocalizedRichDoc; left: Choice[]; right: Choice[] }
  | { type: 'numeric'; stem: LocalizedRichDoc; unit: LocalizedText | null };

type Explanation = LocalizedRichDoc | null;
export type StudentAnswer =
  | { type: 'single_choice'; correctOptionId: string; explanation: Explanation }
  | { type: 'multiple_choice'; correctOptionIds: string[]; explanation: Explanation }
  | { type: 'true_false'; correct: boolean; explanation: Explanation }
  | {
      type: 'fill_blank';
      blanks: Array<{ id: string; accepted: string[]; caseSensitive: boolean }>;
      explanation: Explanation;
    }
  | { type: 'match'; pairs: Record<string, string>; explanation: Explanation }
  | { type: 'numeric'; value: number; tolerance: number; explanation: Explanation }
  | { type: 'subjective'; modelAnswer: LocalizedRichDoc; explanation: Explanation };

/** Media-library ids of images inside rich-text documents (any depth), so the API can return their URLs. */
export function mediaIdsIn(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) mediaIdsIn(v, into);
  } else if (value && typeof value === 'object') {
    const node = value as { type?: unknown; attrs?: { mediaId?: unknown } };
    if (node.type === 'image' && typeof node.attrs?.mediaId === 'string') into.add(node.attrs.mediaId);
    for (const v of Object.values(value)) mediaIdsIn(v, into);
  }
  return into;
}
