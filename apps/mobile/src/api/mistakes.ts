import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type { LocalizedText } from '@tk/contracts';
import type { AnswerResponse, Outcome } from '@tk/domain';
import { api, queryClient } from './client';
import type { MediaMap, PracticeQuestion } from './learning';

/** Practice answers and the mistake notebook with revision (D-050). */

export interface MistakeEntry {
  questionId: string;
  timesWrong: number;
  correctStreak: number;
  lastWrongAt: string;
  lastSource: 'test' | 'practice';
  subject: { id: string; name: LocalizedText };
  question: PracticeQuestion;
}

export interface MistakesPage {
  data: MistakeEntry[];
  nextCursor: string | null;
  /** Correct answers in a row that master a question (CMS setting). */
  required: number;
  media: MediaMap;
}

export interface MistakesSummary {
  active: number;
  mastered: number;
  required: number;
  subjects: Array<{ id: string; name: LocalizedText; count: number }>;
}

export interface ReviewResult {
  outcome: Outcome;
  correctStreak: number;
  required: number;
  mastered: boolean;
}

export const mistakeKeys = {
  all: ['mistakes'] as const,
  list: (subjectId: string | null) => ['mistakes', 'list', subjectId ?? 'all'] as const,
  summary: ['mistakes', 'summary'] as const,
};

export function useMistakes(subjectId: string | null) {
  return useInfiniteQuery({
    queryKey: mistakeKeys.list(subjectId),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20' });
      if (subjectId) params.set('subjectId', subjectId);
      if (pageParam) params.set('cursor', pageParam);
      return api.get<MistakesPage>(`/me/mistakes?${params.toString()}`);
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useMistakesSummary() {
  return useQuery({
    queryKey: mistakeKeys.summary,
    queryFn: () => api.get<MistakesSummary>('/me/mistakes/summary'),
  });
}

/** Records a checked practice answer (scored on the server); a mistake joins the notebook. */
export function useRecordPractice(questionId: string) {
  return useMutation({
    mutationFn: (response: AnswerResponse) =>
      api.post<{ outcome: Outcome; addedToNotebook: boolean }>(`/practice-questions/${questionId}/check`, {
        response,
      }),
    onSuccess: (r) => {
      if (r.addedToNotebook) void queryClient.invalidateQueries({ queryKey: mistakeKeys.summary });
    },
  });
}

/** A revision answer: a response, or for written answers whether the student got it right. */
export function useReviewMistake(questionId: string) {
  return useMutation({
    mutationFn: (input: { response: AnswerResponse } | { selfCorrect: boolean }) =>
      api.post<ReviewResult>(`/me/mistakes/${questionId}/review`, input),
    onSuccess: (r) => {
      if (r.mastered) void queryClient.invalidateQueries({ queryKey: mistakeKeys.summary });
    },
  });
}

export function useRemoveMistake(questionId: string) {
  return useMutation({
    mutationFn: () => api.delete<void>(`/me/mistakes/${questionId}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: mistakeKeys.all }),
  });
}
