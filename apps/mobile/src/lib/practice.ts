import { scoreQuestion, type AnswerResponse, type Outcome } from '@tk/domain';
import type { PracticeAnswer, RichNode } from '@/api/learning';

/**
 * Feedback for a practice answer, from the shared scoring engine. Practice is not marked or stored, so the scheme
 * only tells correct / partly correct / wrong apart; assessments use the rules chosen in the CMS (D-044).
 */
const FEEDBACK = {
  scheme: { marks: 100, negativeMarks: 0 },
  rules: { multipleChoice: 'partial_if_no_wrong', match: 'per_pair', fillBlank: 'per_blank' },
} as const;

export function practiceOutcome(answer: PracticeAnswer, response: AnswerResponse | null): Outcome {
  if (answer.type === 'subjective') return 'pending';
  return scoreQuestion(answer, response, FEEDBACK.scheme, FEEDBACK.rules).outcome;
}

/** Replaces `[[b1]]` blank markers in a rich-text stem with numbered gaps "____ (1)" (fill in the blank). */
export function markBlanks(doc: RichNode, blankIds: string[]): RichNode {
  const number = (id: string) => blankIds.indexOf(id) + 1;
  const walk = (node: RichNode): RichNode => ({
    ...node,
    ...(typeof node.text === 'string'
      ? {
          text: node.text.replace(
            /\[\[([a-z0-9]{1,8})\]\]/g,
            (_, id: string) => `____ (${number(id) || '?'})`,
          ),
        }
      : {}),
    ...(node.content ? { content: node.content.map(walk) } : {}),
  });
  return walk(doc);
}
