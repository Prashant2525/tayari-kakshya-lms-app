import { z } from 'zod';
import { AnswerResponseInput } from './assessments.js';
import { CursorQuery } from './common.js';

/** Practice answers and the mistake notebook (D-050). */

/** A practice answer to record: the server scores it itself (the app's own check is only for instant feedback). */
export const PracticeCheckInput = z.object({ response: AnswerResponseInput });
export type PracticeCheckInput = z.infer<typeof PracticeCheckInput>;

/**
 * A revision answer: auto-marked questions send the response; written answers are self-reviewed against the model
 * answer (`selfCorrect`).
 */
export const MistakeReviewInput = z.union([
  z.object({ response: AnswerResponseInput }).strict(),
  z.object({ selfCorrect: z.boolean() }).strict(),
]);
export type MistakeReviewInput = z.infer<typeof MistakeReviewInput>;

export const MistakesQuery = CursorQuery.extend({ subjectId: z.uuid().optional() });
export type MistakesQuery = z.infer<typeof MistakesQuery>;
