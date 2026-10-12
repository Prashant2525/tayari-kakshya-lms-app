import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type { AccessLevel, LiveProvider, LiveStatus, LiveWhen, LocalizedText } from '@tk/contracts';
import { api, queryClient } from './client';
import type { Playback } from './learning';

/** Live classes (S22, D-072). The link is never listed: it comes only from Join, when the class is open. */
export interface LiveClassView {
  id: string;
  course: { id: string; slug: string; title: LocalizedText };
  title: LocalizedText;
  description: LocalizedText | null;
  provider: LiveProvider;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  accessLevel: AccessLevel;
  instructor: { name: string } | null;
  status: LiveStatus;
  hasRecording: boolean;
  /** May this student join (free, or access to the course)? */
  access: boolean;
  joinOpensAt: string;
  canJoin: boolean;
  attended: boolean;
}

export type LiveJoin =
  { provider: 'youtube'; embedUrl: string } | { provider: 'zoom'; joinUrl: string; passcode: string | null };

export const liveKeys = {
  list: (when: LiveWhen, courseId?: string) => ['live', when, courseId ?? null] as const,
  one: (id: string) => ['live', 'one', id] as const,
};

type Page<T> = { data: T[]; nextCursor: string | null };

export function useLiveClasses(when: LiveWhen, courseId?: string, limit = 20) {
  return useInfiniteQuery({
    queryKey: [...liveKeys.list(when, courseId), limit],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ when, limit: String(limit) });
      if (courseId) params.set('courseId', courseId);
      if (pageParam) params.set('cursor', pageParam);
      return api.get<Page<LiveClassView>>(`/live-classes?${params}`);
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // The join button opens by the clock: keep the list fresh while it is on screen.
    refetchInterval: 60_000,
  });
}

export function useLiveClass(id: string) {
  return useQuery({
    queryKey: liveKeys.one(id),
    queryFn: () => api.get<LiveClassView>(`/live-classes/${id}`),
    refetchInterval: 30_000,
  });
}

export function useJoinLive(id: string) {
  return useMutation({
    mutationFn: () => api.post<LiveJoin>(`/live-classes/${id}/join`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['live'] }),
  });
}

export function fetchLiveRecording(id: string) {
  return api.get<Playback>(`/live-classes/${id}/recording`);
}
