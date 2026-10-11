import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type { PublicReview, RatingSummary, ReviewInput, ReviewStatus } from '@tk/contracts';
import { api, queryClient } from './client';

/** Course reviews (S4, D-066): approved ones for everyone; the student's own with its status. */
export interface ReviewsPage {
  summary: RatingSummary & { stars: Record<'1' | '2' | '3' | '4' | '5', number> };
  data: PublicReview[];
  nextCursor: string | null;
}

export interface MyReview {
  hasCourse: boolean;
  progressPercent: number;
  requiredPercent: number;
  canReview: boolean;
  review: {
    rating: number;
    body: string | null;
    status: ReviewStatus;
    rejectionReason: string | null;
    updatedAt: string;
  } | null;
}

export const reviewKeys = {
  list: (slug: string) => ['reviews', slug] as const,
  mine: (courseId: string) => ['reviews', 'mine', courseId] as const,
};

export function useCourseReviews(slug: string, limit = 20) {
  return useInfiniteQuery({
    queryKey: [...reviewKeys.list(slug), limit],
    queryFn: ({ pageParam }) =>
      api.get<ReviewsPage>(
        `/courses/${encodeURIComponent(slug)}/reviews?limit=${limit}${pageParam ? `&cursor=${pageParam}` : ''}`,
        { auth: false },
      ),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useMyReview(courseId: string, enabled: boolean) {
  return useQuery({
    queryKey: reviewKeys.mine(courseId),
    queryFn: () => api.get<MyReview>(`/me/courses/${courseId}/review`),
    enabled,
  });
}

export function useSaveReview(courseId: string) {
  return useMutation({
    mutationFn: (input: ReviewInput) => api.put<MyReview>(`/me/courses/${courseId}/review`, input),
    onSuccess: (mine) => queryClient.setQueryData(reviewKeys.mine(courseId), mine),
  });
}

export function useDeleteReview(courseId: string) {
  return useMutation({
    mutationFn: () => api.delete(`/me/courses/${courseId}/review`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['reviews'] }),
  });
}
