import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import type {
  DiscussionPostInput,
  DiscussionPostView,
  DiscussionTarget,
  ReportPostInput,
} from '@tk/contracts';
import { api, queryClient } from './client';

/** Discussions under questions and lessons (S12, D-066). */
export interface ThreadPage {
  data: Array<DiscussionPostView & { replies: DiscussionPostView[] }>;
  nextCursor: string | null;
  count: number;
  canPost: boolean;
  bannedUntil: string | null;
}

const threadKey = (target: DiscussionTarget, id: string) => ['discussions', target, id] as const;

export function useThread(target: DiscussionTarget, id: string) {
  return useInfiniteQuery({
    queryKey: threadKey(target, id),
    queryFn: ({ pageParam }) =>
      api.get<ThreadPage>(`/discussions/${target}/${id}?limit=20${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  });
}

const refresh = (target: DiscussionTarget, id: string) =>
  void queryClient.invalidateQueries({ queryKey: threadKey(target, id) });

export function usePostToThread(target: DiscussionTarget, id: string) {
  return useMutation({
    mutationFn: (input: DiscussionPostInput) =>
      api.post<DiscussionPostView>(`/discussions/${target}/${id}/posts`, input),
    onSuccess: () => refresh(target, id),
  });
}

export function useDeletePost(target: DiscussionTarget, id: string) {
  return useMutation({
    mutationFn: (postId: string) => api.delete(`/discussions/posts/${postId}`),
    onSuccess: () => refresh(target, id),
  });
}

export function useReportPost() {
  return useMutation({
    mutationFn: ({ postId, ...input }: ReportPostInput & { postId: string }) =>
      api.post(`/discussions/posts/${postId}/report`, input),
  });
}
