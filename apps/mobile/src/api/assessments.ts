import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type { AnswerResponseInput, LocalizedText } from '@tk/contracts';
import { api, queryClient } from './client';
import type { LocalizedDoc, MediaMap, PracticeAnswer, PracticeQuestionBody } from './learning';

/** Assessments and attempts (§10). Every rule is applied by the API; the app shows what it returns. */

export type AssessmentType = 'quiz' | 'subject_test' | 'weekly' | 'mock' | 'pyq_mock' | 'daily_challenge';
export type WindowState = 'upcoming' | 'open' | 'closed';
export type AttemptStatus = 'in_progress' | 'pending_grading' | 'completed';
export type Outcome = 'correct' | 'partial' | 'wrong' | 'skipped' | 'pending';

export interface AssessmentSummary {
  id: string;
  type: AssessmentType;
  title: LocalizedText;
  accessLevel: 'free' | 'premium';
  locked: boolean;
  state: WindowState;
  opensAt: string | null;
  closesAt: string | null;
  durationSeconds: number | null;
  questionCount: number;
  /** Centimarks; null when random questions carry different marks. */
  totalMarks: number | null;
  maxAttempts: number | null;
  attemptsUsed: number;
  inProgressAttemptId: string | null;
  result: { attemptId: string; score: number | null; maxScore: number | null } | null;
}

export interface AttemptSummary {
  id: string;
  attemptNo: number;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  released: boolean;
  score: number | null;
  maxScore: number;
  passed: boolean | null;
  counted: boolean;
}

export interface AssessmentDetail extends AssessmentSummary {
  instructions: LocalizedDoc | null;
  rules: {
    negativeMarking: boolean;
    passMarks: number | null;
    resultRelease: 'immediate' | 'after_close' | 'manual';
    releaseAt: string | null;
    showExplanations: boolean;
    subjectiveGrading: 'none' | 'self' | 'instructor';
    countedAttempt: 'first' | 'best' | 'latest';
    lateStart: 'until_close' | 'full_duration';
  };
  attempts: AttemptSummary[];
}

export interface Passage {
  id: string;
  title: LocalizedText | null;
  content: LocalizedDoc;
}

export interface AttemptQuestion {
  questionId: string;
  number: number;
  marks: number;
  negativeMarks: number;
  question: PracticeQuestionBody;
  passage: Passage | null;
  response: AnswerResponseInput | null;
  markedForReview: boolean;
}

export interface AttemptView {
  id: string;
  assessment: { id: string; type: AssessmentType; title: LocalizedText };
  attemptNo: number;
  status: AttemptStatus;
  startedAt: string;
  deadlineAt: string | null;
  serverNow: string;
  /** Phone time when this arrived (with serverNow: the phone's clock offset). */
  receivedAt: number;
  sections: Array<{ title: LocalizedText | null; questions: AttemptQuestion[] }>;
  media: MediaMap;
}

export interface SolvedQuestion extends AttemptQuestion {
  answer: PracticeAnswer | null;
  outcome: Outcome | null;
  awarded: number | null;
}

export interface AttemptResult {
  id: string;
  assessment: {
    id: string;
    type: AssessmentType;
    title: LocalizedText;
    passMarks: number | null;
    showExplanations: boolean;
    subjectiveGrading: 'none' | 'self' | 'instructor';
  };
  attemptNo: number;
  status: AttemptStatus;
  autoSubmitted: boolean;
  startedAt: string;
  submittedAt: string | null;
  timeTakenSeconds: number | null;
  counted: boolean;
  released: boolean;
  releaseAt: string | null;
  summary: {
    score: number | null;
    maxScore: number;
    correct: number;
    partial: number;
    wrong: number;
    skipped: number;
    pending: number;
    passed: boolean | null;
  } | null;
  sections: Array<{
    title: LocalizedText | null;
    score: number;
    maxScore: number;
    correct: number;
    partial: number;
    wrong: number;
    skipped: number;
    pending: number;
  }>;
  questions: SolvedQuestion[];
  media: MediaMap;
  canSelfGrade: boolean;
}

export interface HistoryItem extends AttemptSummary {
  assessment: { id: string; type: AssessmentType; title: LocalizedText };
}

export const assessmentKeys = {
  list: (scope: string) => ['assessments', scope] as const,
  detail: (id: string) => ['assessment', id] as const,
  attempt: (id: string) => ['attempt', id] as const,
  result: (id: string) => ['attempt-result', id] as const,
  history: ['me', 'attempts'] as const,
};

export type AssessmentScope = { courseId: string; subjectId?: string } | { mine: true };

const scopeQuery = (s: AssessmentScope) =>
  'mine' in s ? 'mine=true' : `courseId=${s.courseId}${s.subjectId ? `&subjectId=${s.subjectId}` : ''}`;

export function useAssessments(scope: AssessmentScope) {
  const q = scopeQuery(scope);
  return useQuery({
    queryKey: assessmentKeys.list(q),
    queryFn: () => api.get<{ data: AssessmentSummary[] }>(`/assessments?${q}`),
  });
}

export function useAssessment(id: string) {
  return useQuery({
    queryKey: assessmentKeys.detail(id),
    queryFn: () => api.get<AssessmentDetail>(`/assessments/${id}`),
  });
}

/** Starts or resumes; the API returns the running attempt either way. */
export function useStartAttempt(assessmentId: string) {
  return useMutation({
    mutationFn: async () => ({
      ...(await api.post<Omit<AttemptView, 'receivedAt'>>(`/assessments/${assessmentId}/attempts`)),
      receivedAt: Date.now(),
    }),
    onSuccess: (view) => {
      queryClient.setQueryData(assessmentKeys.attempt(view.id), view);
      void queryClient.invalidateQueries({ queryKey: assessmentKeys.detail(assessmentId) });
    },
  });
}

export function useAttempt(id: string) {
  return useQuery({
    queryKey: assessmentKeys.attempt(id),
    queryFn: async () => ({
      ...(await api.get<Omit<AttemptView, 'receivedAt'>>(`/attempts/${id}`)),
      receivedAt: Date.now(),
    }),
    // Exam mode keeps its own answers; refetching would fight the student's typing.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function saveAnswers(
  attemptId: string,
  answers: Array<{ questionId: string; response: AnswerResponseInput | null; markedForReview: boolean }>,
) {
  return api.put<{ savedAt: string; serverNow: string }>(`/attempts/${attemptId}/answers`, { answers });
}

export function submitAttempt(attemptId: string) {
  return api.post<AttemptResult>(`/attempts/${attemptId}/submit`);
}

/** After a submit: the result is fresh, and lists / history / the test page show the new attempt. */
export function afterSubmit(result: AttemptResult) {
  queryClient.setQueryData(assessmentKeys.result(result.id), result);
  void queryClient.invalidateQueries({ queryKey: ['assessments'] });
  void queryClient.invalidateQueries({ queryKey: assessmentKeys.detail(result.assessment.id) });
  void queryClient.invalidateQueries({ queryKey: assessmentKeys.history });
}

export function useAttemptResult(id: string) {
  return useQuery({
    queryKey: assessmentKeys.result(id),
    queryFn: () => api.get<AttemptResult>(`/attempts/${id}/result`),
  });
}

export function useSelfGrade(attemptId: string) {
  return useMutation({
    mutationFn: (grades: Array<{ questionId: string; awarded: number }>) =>
      api.post<AttemptResult>(`/attempts/${attemptId}/self-grade`, { grades }),
    onSuccess: afterSubmit,
  });
}

export function useAttemptHistory() {
  return useInfiniteQuery({
    queryKey: assessmentKeys.history,
    queryFn: ({ pageParam }) =>
      api.get<{ data: HistoryItem[]; nextCursor: string | null }>(
        `/me/attempts?limit=20${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}
