import type { LocalizedText, QuestionType } from '@tk/contracts';
import { formatMarks } from '@tk/domain';
import type { JsonNode } from './rich-doc';

/** Grading queue, results and attempt detail (§10 part 2). Marks from the API are centimarks. */

export type LocalizedDoc = { en?: JsonNode; ne?: JsonNode };

export const marksText = (centimarks: number | null | undefined) =>
  centimarks === null || centimarks === undefined ? '—' : formatMarks(centimarks);

export const ATTEMPT_STATUS_LABEL = {
  in_progress: 'In progress',
  pending_grading: 'Awaiting marks',
  completed: 'Completed',
  voided: 'Voided',
} as const;
export type AttemptStatus = keyof typeof ATTEMPT_STATUS_LABEL;

export const OUTCOME_LABEL = {
  correct: 'Correct',
  partial: 'Part marks',
  wrong: 'Wrong',
  skipped: 'Not answered',
  pending: 'Awaiting marks',
} as const;
export type Outcome = keyof typeof OUTCOME_LABEL;

export interface QuestionBody {
  type: QuestionType;
  stem: LocalizedDoc;
  options?: Array<{ id: string; content: LocalizedDoc }>;
  left?: Array<{ id: string; content: LocalizedDoc }>;
  right?: Array<{ id: string; content: LocalizedDoc }>;
  blanks?: Array<{ id: string }>;
}

/** Answer key as the API sends it (subset used by the screens). */
export interface AnswerKey {
  type: QuestionType;
  correctOptionId?: string;
  correctOptionIds?: string[];
  correct?: boolean;
  blanks?: Array<{ id: string; accepted: string[] }>;
  pairs?: Record<string, string>;
  value?: number;
  tolerance?: number;
  modelAnswer?: LocalizedDoc;
  explanation?: LocalizedDoc | null;
}

/** A student's response (shape per question type). */
export type Response = {
  type: QuestionType;
  optionId?: string | null;
  optionIds?: string[];
  value?: boolean | number | null;
  blanks?: Record<string, string>;
  pairs?: Record<string, string>;
  text?: string;
} | null;

export interface GradingItem {
  attemptId: string;
  questionId: string;
  assessment: { id: string; title: LocalizedText };
  student: string;
  submittedAt: string | null;
  marks: number;
  question: QuestionBody;
  answer: AnswerKey;
  response: Response;
}

export interface GradingQueue {
  total: number;
  assessments: Array<{ id: string; title: LocalizedText }>;
  data: GradingItem[];
}

export interface AttemptRow {
  id: string;
  attemptNo: number;
  status: AttemptStatus;
  autoSubmitted: boolean;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  maxScore: number;
  pending: number;
  passed: boolean | null;
  timeTakenSeconds: number | null;
  practice: boolean;
}

export interface AssessmentResults {
  assessment: {
    id: string;
    title: LocalizedText;
    resultRelease: 'immediate' | 'after_close' | 'manual';
    resultsReleasedAt: string | null;
    released: boolean;
    subjectiveGrading: 'none' | 'self' | 'instructor';
    passMarks: number | null;
  };
  stats: {
    attempts: number;
    students: number;
    inProgress: number;
    pendingGrading: number;
    averageScore: number | null;
    passed: number;
    withPassMark: number;
  };
  data: Array<AttemptRow & { student: { id: string; fullName: string }; official: boolean }>;
  nextCursor: string | null;
}

export interface AttemptDetail extends AttemptRow {
  assessment: { id: string; title: LocalizedText; subjectiveGrading: 'none' | 'self' | 'instructor' };
  student: { id: string; fullName: string };
  questions: Array<{
    questionId: string;
    number: number;
    marks: number;
    negativeMarks: number;
    question: QuestionBody;
    answer: AnswerKey;
    response: Response;
    markedForReview: boolean;
    outcome: Outcome | null;
    awarded: number | null;
    gradedBy: string | null;
    gradedAt: string | null;
    graderComment: string | null;
  }>;
}
