import { scoreQuestion, type AnswerKey, type AnswerResponse, type Outcome } from '../assessment/scoring.js';

/**
 * Practice feedback and the mistake notebook (T-041, D-050).
 *
 * Practice is not marked: this scheme only tells correct / partly correct / wrong apart (partial credit for an
 * incomplete multiple choice with no wrong option, per pair, per blank). Assessments use the rules chosen in the
 * CMS (D-044).
 */
const FEEDBACK = {
  scheme: { marks: 100, negativeMarks: 0 },
  rules: { multipleChoice: 'partial_if_no_wrong', match: 'per_pair', fillBlank: 'per_blank' },
} as const;

/** Correct / partial / wrong / skipped for an auto-marked question; written answers are self-reviewed ('pending'). */
export function practiceOutcome(answer: AnswerKey, response: AnswerResponse | null): Outcome {
  if (answer.type === 'subjective') return 'pending';
  return scoreQuestion(answer, response, FEEDBACK.scheme, FEEDBACK.rules).outcome;
}

/** D-050: anything without full marks is a mistake; questions left unanswered are not. */
export function isMistake(outcome: Outcome | null): boolean {
  return outcome === 'wrong' || outcome === 'partial';
}

export type MistakeStatus = 'active' | 'mastered' | 'removed';

export interface MistakeState {
  status: MistakeStatus;
  timesWrong: number;
  correctStreak: number;
  lastWrongAt: Date;
  lastReviewedAt: Date | null;
  masteredAt: Date | null;
}

/**
 * A new mistake on a question. It (re)enters the notebook with the streak reset — unless it happened before the
 * student's latest revision of it (a test whose results were released late): then it only counts in the history.
 */
export function recordMistake(prev: MistakeState | null, at: Date): MistakeState {
  if (!prev) {
    return {
      status: 'active',
      timesWrong: 1,
      correctStreak: 0,
      lastWrongAt: at,
      lastReviewedAt: null,
      masteredAt: null,
    };
  }
  const timesWrong = prev.timesWrong + 1;
  if (prev.lastReviewedAt && at <= prev.lastReviewedAt) {
    return { ...prev, timesWrong, lastWrongAt: at > prev.lastWrongAt ? at : prev.lastWrongAt };
  }
  return {
    ...prev,
    status: 'active',
    timesWrong,
    correctStreak: 0,
    lastWrongAt: at > prev.lastWrongAt ? at : prev.lastWrongAt,
    masteredAt: null,
  };
}

/**
 * A revision answer. Correct extends the run; at `correctInARow` the question is mastered and leaves the notebook.
 * Wrong or partly correct resets the run and counts as another mistake.
 */
export function reviewMistake(
  prev: MistakeState,
  correct: boolean,
  at: Date,
  correctInARow: number,
): MistakeState {
  if (!correct) {
    return {
      ...prev,
      timesWrong: prev.timesWrong + 1,
      correctStreak: 0,
      lastWrongAt: at,
      lastReviewedAt: at,
    };
  }
  const correctStreak = prev.correctStreak + 1;
  const mastered = correctStreak >= correctInARow;
  return {
    ...prev,
    correctStreak,
    lastReviewedAt: at,
    status: mastered ? 'mastered' : prev.status,
    masteredAt: mastered ? at : null,
  };
}
