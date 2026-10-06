import { practiceOutcome as feedback, type AnswerKey, type AnswerResponse, type Outcome } from '@tk/domain';
import type { PracticeAnswer, RichNode } from '@/api/learning';

/**
 * Instant feedback for a practice answer, from the shared engine the API also uses (@tk/domain): it only tells
 * correct / partly correct / wrong apart. The API scores the answer again when recording it (mistake notebook, D-050).
 */
export function practiceOutcome(answer: PracticeAnswer, response: AnswerResponse | null): Outcome {
  return feedback(answer as AnswerKey, response);
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
