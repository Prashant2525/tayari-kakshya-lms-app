import { useMutation, useQuery } from '@tanstack/react-query';
import type { StudyPlanInput, StudyPlanSummary, StudyPlanView } from '@tk/contracts';
import { api, queryClient } from './client';

/** Study plans (S7, D-066): worked out by the API on each request, so they are never cached for long. */
export const plannerKeys = {
  all: ['study-plans'] as const,
  one: (courseId: string) => ['study-plans', courseId] as const,
};

export function useStudyPlans() {
  return useQuery({
    queryKey: plannerKeys.all,
    queryFn: () => api.get<{ data: StudyPlanSummary[] }>('/me/study-plans').then((r) => r.data),
    staleTime: 0,
  });
}

export function useStudyPlan(courseId: string) {
  return useQuery({
    queryKey: plannerKeys.one(courseId),
    queryFn: () => api.get<StudyPlanView>(`/me/study-plans/${courseId}`),
    enabled: Boolean(courseId),
    staleTime: 0,
  });
}

export function useSavePlan(courseId: string) {
  return useMutation({
    mutationFn: (input: StudyPlanInput) => api.put<StudyPlanView>(`/me/study-plans/${courseId}`, input),
    onSuccess: (plan) => {
      queryClient.setQueryData(plannerKeys.one(courseId), plan);
      void queryClient.invalidateQueries({ queryKey: plannerKeys.all, exact: true });
    },
  });
}

export function useDeletePlan(courseId: string) {
  return useMutation({
    mutationFn: () => api.delete(`/me/study-plans/${courseId}`),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: plannerKeys.one(courseId) });
      void queryClient.invalidateQueries({ queryKey: plannerKeys.all, exact: true });
    },
  });
}
