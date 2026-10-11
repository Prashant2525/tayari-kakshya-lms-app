import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type { LocalizedText, NotificationCategory, NotificationPreferencesInput } from '@tk/contracts';
import { api, queryClient } from './client';
import type { MediaMap, RichNode } from './learning';

/** Notices (D-019) and notifications (D-033). */

export type NoticeKind = 'official' | 'announcement' | 'instructor';

export interface NoticeRow {
  id: string;
  kind: NoticeKind;
  title: LocalizedText;
  summary: LocalizedText;
  isPinned: boolean;
  publishedAt: string;
}

export interface NoticeDetail extends Omit<NoticeRow, 'summary'> {
  body: { en?: RichNode; ne?: RichNode };
  media: MediaMap;
}

export type NotificationLink =
  | { type: 'notice'; id: string }
  | { type: 'course'; slug: string }
  | { type: 'plan'; slug: string }
  | { type: 'order'; id: string }
  | { type: 'assessment'; id: string }
  | { type: 'attempt'; id: string }
  | { type: 'article'; slug: string }
  | { type: 'discussion'; target: 'question' | 'lesson'; id: string };

export interface NotificationRow {
  id: string;
  category: NotificationCategory;
  title: LocalizedText;
  body: LocalizedText;
  link: NotificationLink | null;
  createdAt: string;
  read: boolean;
}

export const noticeKeys = {
  list: ['notices'] as const,
  one: (id: string) => ['notice', id] as const,
  unseen: ['me', 'notices', 'unseen'] as const,
  inbox: ['me', 'notifications'] as const,
  unread: ['me', 'notifications', 'unread'] as const,
  prefs: ['me', 'notification-preferences'] as const,
};

type Page<T> = { data: T[]; nextCursor: string | null };

export function useNotices() {
  return useInfiniteQuery({
    queryKey: noticeKeys.list,
    queryFn: ({ pageParam }) =>
      api.get<Page<NoticeRow>>(`/notices?limit=20${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useNotice(id: string) {
  return useQuery({ queryKey: noticeKeys.one(id), queryFn: () => api.get<NoticeDetail>(`/notices/${id}`) });
}

/** Notices published since the student last opened the tab (its badge). */
export function useUnseenNotices(enabled: boolean) {
  return useQuery({
    queryKey: noticeKeys.unseen,
    queryFn: () => api.get<{ count: number }>('/me/notices/unseen'),
    enabled,
    refetchInterval: 5 * 60_000,
  });
}

export async function markNoticesSeen() {
  await api.post('/me/notices/seen').catch(() => undefined);
  queryClient.setQueryData(noticeKeys.unseen, { count: 0 });
}

export function useNotificationsInbox() {
  return useInfiniteQuery({
    queryKey: noticeKeys.inbox,
    queryFn: ({ pageParam }) =>
      api.get<Page<NotificationRow>>(`/me/notifications?limit=30${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useUnreadNotifications(enabled: boolean) {
  return useQuery({
    queryKey: noticeKeys.unread,
    queryFn: () => api.get<{ count: number }>('/me/notifications/unread'),
    enabled,
    refetchInterval: 2 * 60_000,
  });
}

export async function markNotificationsRead(ids: string[]) {
  await api.post('/me/notifications/read', { ids }).catch(() => undefined);
  void queryClient.invalidateQueries({ queryKey: noticeKeys.inbox });
  void queryClient.invalidateQueries({ queryKey: noticeKeys.unread });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: noticeKeys.prefs,
    queryFn: () => api.get<NotificationPreferencesInput>('/me/notification-preferences'),
  });
}

export function useSaveNotificationPreferences() {
  return useMutation({
    mutationFn: (prefs: NotificationPreferencesInput) =>
      api.put<NotificationPreferencesInput>('/me/notification-preferences', prefs),
    onSuccess: (saved) => queryClient.setQueryData(noticeKeys.prefs, saved),
  });
}
