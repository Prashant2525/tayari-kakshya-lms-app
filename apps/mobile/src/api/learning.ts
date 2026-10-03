import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type { LearningProgressInput, LocalizedText } from '@tk/contracts';
import { api, queryClient } from './client';
import { keys as accountKeys, type CourseCardView } from './queries';

/** TipTap / ProseMirror JSON, validated by the API (packages/contracts rich-text allow-list). */
export interface RichNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: RichNode[];
}
export type LocalizedDoc = { en?: RichNode; ne?: RichNode };
export type MediaMap = Record<string, { url: string; variants: Record<string, string> }>;

export interface Pricing {
  pricePaisa: number;
  salePricePaisa: number | null;
  saleEndsAt: string | null;
  effectivePricePaisa: number;
}

export interface CatalogCourse extends CourseCardView {
  isFeatured: boolean;
  /** Null where this platform does not sell (iOS, D-027) or purchases are switched off. */
  pricing: Pricing | null;
}

export interface MyCourse extends CatalogCourse {
  progress: { completed: number; total: number };
}

export interface CourseDetail extends CatalogCourse {
  description: LocalizedDoc | null;
  descriptionMedia: MediaMap;
  validity: { type: string; days: number | null; endsOn: string | null };
  contentCounts: Partial<Record<'note' | 'pdf' | 'video', number>>;
  subjects: Array<{
    id: string;
    name: LocalizedText;
    summary: LocalizedText | null;
    iconUrl: string | null;
    fullMarks: number | null;
    passMarks: number | null;
    durationMinutes: number | null;
  }>;
  examNodes: Array<{ id: string; name: LocalizedText; nodeType: string }>;
  instructors: Array<{
    id: string;
    displayName: LocalizedText;
    bio: LocalizedText | null;
    photoUrl: string | null;
  }>;
  access: { entitled: boolean; canEnrol: boolean } | null;
}

export type ItemType = 'note' | 'pdf' | 'video';

export interface OutlineItem {
  id: string;
  type: ItemType;
  title: LocalizedText;
  accessLevel: 'free' | 'premium';
  locked: boolean;
  durationSeconds: number | null;
  pageCount: number | null;
  progress: { position: number | null; completed: boolean } | null;
}

export interface SubjectOutline {
  id: string;
  name: LocalizedText;
  hasPremiumAccess: boolean;
  chapters: Array<{
    id: string;
    numberLabel: string | null;
    title: LocalizedText;
    estimatedMinutes: number | null;
    topics: Array<{
      id: string;
      numberLabel: string | null;
      title: LocalizedText;
      description: LocalizedText | null;
      items: OutlineItem[];
    }>;
  }>;
}

export interface ItemContent {
  id: string;
  type: ItemType;
  title: LocalizedText;
  accessLevel: 'free' | 'premium';
  durationSeconds: number | null;
  noteContent?: LocalizedDoc | null;
  media?: MediaMap;
  pageCount?: number | null;
  downloadable?: boolean;
}

export interface Playback {
  provider: 'bunny' | 'youtube';
  embedUrl: string;
  expiresAt: string | null;
}

export interface ContinueItem {
  item: {
    id: string;
    type: ItemType;
    title: LocalizedText;
    position: number | null;
    durationSeconds: number | null;
    pageCount: number | null;
  };
  subject: { id: string; name: LocalizedText };
  course: { id: string; slug: string; title: LocalizedText } | null;
}

export const learningKeys = {
  courses: (examNodeId: string | null, q: string) => ['courses', examNodeId, q] as const,
  course: (slug: string) => ['course', slug] as const,
  outline: (courseId: string, subjectId: string) => ['outline', courseId, subjectId] as const,
  item: (id: string) => ['item', id] as const,
  continue: ['me', 'continue'] as const,
};

export function useCatalog(examNodeId: string | null, q: string) {
  return useInfiniteQuery({
    queryKey: learningKeys.courses(examNodeId, q),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20' });
      if (examNodeId) params.set('examNodeId', examNodeId);
      if (q) params.set('q', q);
      if (pageParam) params.set('cursor', pageParam);
      return api.get<{ data: CatalogCourse[]; nextCursor: string | null }>(`/courses?${params}`, {
        auth: false,
      });
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useMyCourseList() {
  return useQuery({ queryKey: accountKeys.myCourses, queryFn: () => api.get<MyCourse[]>('/me/courses') });
}

export function useCourse(slug: string) {
  return useQuery({
    queryKey: learningKeys.course(slug),
    queryFn: () => api.get<CourseDetail>(`/courses/${slug}`),
  });
}

export function useOutline(courseId: string, subjectId: string) {
  return useQuery({
    queryKey: learningKeys.outline(courseId, subjectId),
    queryFn: () => api.get<SubjectOutline>(`/courses/${courseId}/subjects/${subjectId}/outline`),
    enabled: Boolean(courseId && subjectId),
  });
}

export function useItem(id: string) {
  // Item bodies are never cached between sessions: access can change (expiry, refunds).
  return useQuery({
    queryKey: learningKeys.item(id),
    queryFn: () => api.get<ItemContent>(`/learning-items/${id}`),
    staleTime: 0,
  });
}

export function useContinue() {
  return useQuery({
    queryKey: learningKeys.continue,
    queryFn: async () => (await api.get<{ next: ContinueItem | null }>('/me/continue')).next,
  });
}

export function fetchPlayback(itemId: string) {
  return api.get<Playback>(`/learning-items/${itemId}/playback`);
}

export function useEnrol(slug: string) {
  return useMutation({
    mutationFn: (courseId: string) => api.post(`/courses/${courseId}/enrol`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: learningKeys.course(slug) }),
        queryClient.invalidateQueries({ queryKey: accountKeys.myCourses }),
      ]);
    },
  });
}

/** Saves progress quietly; outline, course progress and Continue refresh afterwards. */
export function useSaveProgress(itemId: string) {
  return useMutation({
    mutationFn: (input: LearningProgressInput) =>
      api.put<{ position: number | null; completed: boolean }>(`/learning-items/${itemId}/progress`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['outline'] });
      void queryClient.invalidateQueries({ queryKey: learningKeys.continue });
      void queryClient.invalidateQueries({ queryKey: accountKeys.myCourses });
    },
  });
}
