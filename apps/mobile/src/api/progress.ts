import { useQuery } from '@tanstack/react-query';
import type { ProgressSummary } from '@tk/contracts';
import { api } from './client';

/** The student's progress analytics (S8, D-066): study time, accuracy, weak / strong topics, recent results. */
export function useProgress() {
  return useQuery({
    queryKey: ['progress'],
    queryFn: () => api.get<ProgressSummary>('/me/progress'),
    staleTime: 30_000,
  });
}
