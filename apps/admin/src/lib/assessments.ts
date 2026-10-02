import type { AssessmentType, LocalizedText, PublishStatus, QuestionType } from '@tk/contracts';

export const ASSESSMENT_TYPE_LABEL: Record<AssessmentType, string> = {
  quiz: 'Quiz',
  subject_test: 'Subject test',
  weekly: 'Weekly exam',
  mock: 'Mock exam',
  pyq_mock: 'Previous-year mock',
  daily_challenge: 'Daily challenge',
};

export const RESULT_RELEASE_LABEL = {
  immediate: 'Right after submitting',
  after_close: 'After the exam window closes',
  manual: 'When staff release them',
} as const;

export const SUBJECTIVE_GRADING_LABEL = {
  none: 'No written answers',
  self: 'Students compare with the model answer',
  instructor: 'Instructors grade them',
} as const;

export interface ScoringRules {
  negativeMarking: boolean;
  multipleChoice: 'all_or_nothing' | 'partial_if_no_wrong';
  match: 'all_or_nothing' | 'per_pair';
  fillBlank: 'all_or_nothing' | 'per_blank';
  scoreFloor: 'none' | 'zero';
}

export interface PoolFilter {
  subjectId: string;
  chapterId?: string | null;
  topicId?: string | null;
  difficulty?: 'easy' | 'medium' | 'hard' | null;
  types?: QuestionType[];
  tags?: string[];
  pyqOnly?: boolean;
}

export interface SectionQuestion {
  questionId: string;
  type: QuestionType;
  status: PublishStatus | 'deleted';
  difficulty: 'easy' | 'medium' | 'hard';
  preview: string;
  defaultMarks: number;
  defaultNegativeMarks: number;
  marks: number | null;
  negativeMarks: number | null;
}

export interface AssessmentSection {
  id: string;
  title: LocalizedText | null;
  pickMode: 'fixed' | 'random';
  filter: PoolFilter | null;
  questionCount: number | null;
  marksPerQuestion: number | null;
  negativeMarksPerQuestion: number | null;
  questions: SectionQuestion[];
}

export interface Readiness {
  ready: boolean;
  questions: number;
  totalMarks: { min: number; max: number };
  problems: Array<{ section: number | null; message: string }>;
  warnings: Array<{ section: number | null; message: string }>;
}

export interface AssessmentDetail {
  id: string;
  type: AssessmentType;
  title: LocalizedText;
  instructions: { en?: unknown; ne?: unknown } | null;
  course: { id: string; title: LocalizedText } | null;
  subject: { id: string; name: LocalizedText } | null;
  chapter: { id: string; title: LocalizedText } | null;
  topic: { id: string; title: LocalizedText } | null;
  examNode: { id: string; name: LocalizedText } | null;
  accessLevel: 'free' | 'premium';
  availability: 'always' | 'window';
  opensAt: string | null;
  closesAt: string | null;
  durationMinutes: number | null;
  maxAttempts: number | null;
  passMarks: number | null;
  scoring: ScoringRules;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  resultRelease: keyof typeof RESULT_RELEASE_LABEL;
  showExplanations: boolean;
  leaderboardEnabled: boolean;
  subjectiveGrading: keyof typeof SUBJECTIVE_GRADING_LABEL;
  challengeDate: string | null;
  status: PublishStatus;
  publishAt: string | null;
  updatedAt: string;
  sections: AssessmentSection[];
  readiness: Readiness;
}

export interface AssessmentRow {
  id: string;
  type: AssessmentType;
  title: LocalizedText;
  status: PublishStatus;
  publishAt: string | null;
  availability: 'always' | 'window';
  opensAt: string | null;
  closesAt: string | null;
  challengeDate: string | null;
  course: LocalizedText | null;
  subject: LocalizedText | null;
  questionCount: number;
  updatedAt: string;
}

/** `assessments.defaults` (null scoring fields = the admin must choose). */
export interface AssessmentDefaults {
  resultRelease: keyof typeof RESULT_RELEASE_LABEL;
  showExplanations: boolean;
  maxAttempts: number | null;
  scoring: { [K in keyof ScoringRules]: ScoringRules[K] | null };
}
