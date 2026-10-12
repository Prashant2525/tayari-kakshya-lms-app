import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type { LearningProgressInput, LocalizedText } from '@tk/contracts';
import { track } from '@/lib/analytics';
import { certificateKeys, type CourseCertificate, type NewCertificate } from './certificates';
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
  /** Free lessons to try before buying (D-074). */
  previewItems: Array<{
    id: string;
    type: ItemType;
    title: LocalizedText;
    durationSeconds: number | null;
    subjectId: string;
  }>;
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
  access: { entitled: boolean; canEnrol: boolean; certificate: CourseCertificate | null } | null;
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
    onSuccess: async (_, courseId) => {
      track('course_enrolled', { course_id: courseId });
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
      api.put<{ position: number | null; completed: boolean; newCertificates: NewCertificate[] }>(
        `/learning-items/${itemId}/progress`,
        input,
      ),
    onSuccess: (result, input) => {
      if (input.completed) track('lesson_completed', { item_id: itemId });
      if (result.newCertificates.length) {
        track('certificate_earned', { count: result.newCertificates.length });
        void queryClient.invalidateQueries({ queryKey: certificateKeys.mine });
      }
      // Course pages show certificate progress.
      if (input.completed) void queryClient.invalidateQueries({ queryKey: ['course'] });
      void queryClient.invalidateQueries({ queryKey: ['outline'] });
      void queryClient.invalidateQueries({ queryKey: learningKeys.continue });
      void queryClient.invalidateQueries({ queryKey: accountKeys.myCourses });
    },
  });
}

// ───────────── Practice questions, bookmarks, search ─────────────

type Choice = { id: string; content: LocalizedDoc };

/** The question part (always sent). */
export type PracticeQuestionBody =
  | { type: 'single_choice' | 'multiple_choice'; stem: LocalizedDoc; options: Choice[] }
  | { type: 'true_false' | 'subjective'; stem: LocalizedDoc }
  | { type: 'fill_blank'; stem: LocalizedDoc; blanks: Array<{ id: string }> }
  | { type: 'match'; stem: LocalizedDoc; left: Choice[]; right: Choice[] }
  | { type: 'numeric'; stem: LocalizedDoc; unit: LocalizedText | null };

type Explanation = LocalizedDoc | null;
/** The answer part — null when the question is locked (never sent by the API). */
export type PracticeAnswer =
  | { type: 'single_choice'; correctOptionId: string; explanation: Explanation }
  | { type: 'multiple_choice'; correctOptionIds: string[]; explanation: Explanation }
  | { type: 'true_false'; correct: boolean; explanation: Explanation }
  | {
      type: 'fill_blank';
      blanks: Array<{ id: string; accepted: string[]; caseSensitive: boolean }>;
      explanation: Explanation;
    }
  | { type: 'match'; pairs: Record<string, string>; explanation: Explanation }
  | { type: 'numeric'; value: number; tolerance: number; explanation: Explanation }
  | { type: 'subjective'; modelAnswer: LocalizedDoc; explanation: Explanation };

export interface PracticeQuestion {
  id: string;
  subjectId: string;
  topicId: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  marks: number;
  accessLevel: 'free' | 'premium';
  locked: boolean;
  isPyq: boolean;
  sources: Array<{ yearBs: number | null; examNode: { id: string; name: LocalizedText } | null }>;
  passage: { id: string; title: LocalizedText | null; content: LocalizedDoc } | null;
  question: PracticeQuestionBody;
  answer: PracticeAnswer | null;
}

export type Bookmark =
  | {
      targetType: 'learning_item';
      id: string;
      createdAt: string;
      itemType: ItemType;
      title: LocalizedText;
      subject: { id: string; name: LocalizedText };
    }
  | {
      targetType: 'question';
      id: string;
      createdAt: string;
      preview: string;
      subject: { id: string; name: LocalizedText };
    };
export type BookmarkTarget = Bookmark['targetType'];

export interface SearchResults {
  courses: CatalogCourse[];
  items: Array<{
    id: string;
    type: ItemType;
    title: LocalizedText;
    accessLevel: 'free' | 'premium';
    subject: { id: string; name: LocalizedText };
  }>;
  questions: Array<{
    id: string;
    preview: string;
    accessLevel: 'free' | 'premium';
    subject: { id: string; name: LocalizedText };
  }>;
  articles: Array<{
    id: string;
    kind: 'current_affairs' | 'gorkhapatra' | 'news' | 'blog';
    slug: string;
    title: LocalizedText;
    period: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
    periodDate: string | null;
    publishedAt: string;
  }>;
}

export const practiceKeys = {
  list: (courseId: string, subjectId: string) => ['practice', courseId, subjectId] as const,
  one: (id: string) => ['practice-question', id] as const,
  bookmarks: ['me', 'bookmarks'] as const,
  search: (q: string) => ['search', q] as const,
};

export function usePracticeQuestions(courseId: string, subjectId: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: practiceKeys.list(courseId, subjectId),
    queryFn: ({ pageParam }) =>
      api.get<{ data: PracticeQuestion[]; nextCursor: string | null; media: MediaMap }>(
        `/courses/${courseId}/subjects/${subjectId}/questions?limit=20${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

/** Previous-year questions (D-020, D-074): filters, then pages of questions (answers as in practice). */
export interface PyqFilters {
  examNodes: Array<{ id: string; name: LocalizedText }>;
  papers: Array<{ id: string; name: LocalizedText }>;
  years: number[];
}
export type PyqChoice = { examNodeId: string | null; paperId: string | null; yearBs: number | null };

export function usePyqFilters() {
  return useQuery({ queryKey: ['pyq', 'filters'], queryFn: () => api.get<PyqFilters>('/pyq/filters') });
}

export function usePyq(choice: PyqChoice) {
  return useInfiniteQuery({
    queryKey: ['pyq', choice],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20' });
      if (choice.examNodeId) params.set('examNodeId', choice.examNodeId);
      if (choice.paperId) params.set('paperId', choice.paperId);
      if (choice.yearBs) params.set('yearBs', String(choice.yearBs));
      if (pageParam) params.set('cursor', pageParam);
      return api.get<{ data: PracticeQuestion[]; nextCursor: string | null; media: MediaMap }>(
        `/pyq?${params}`,
      );
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function usePracticeQuestion(id: string) {
  return useQuery({
    queryKey: practiceKeys.one(id),
    queryFn: () => api.get<PracticeQuestion & { media: MediaMap }>(`/practice-questions/${id}`),
  });
}

export function useBookmarks() {
  return useQuery({ queryKey: practiceKeys.bookmarks, queryFn: () => api.get<Bookmark[]>('/me/bookmarks') });
}

/** Adds or removes a bookmark; the list refreshes afterwards. */
export function useToggleBookmark() {
  return useMutation({
    mutationFn: ({ type, id, on }: { type: BookmarkTarget; id: string; on: boolean }) =>
      on ? api.put(`/me/bookmarks/${type}/${id}`) : api.delete(`/me/bookmarks/${type}/${id}`),
    onSuccess: (_, { type, on }) => {
      track(on ? 'bookmark_added' : 'bookmark_removed', { target_type: type });
      return queryClient.invalidateQueries({ queryKey: practiceKeys.bookmarks });
    },
  });
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: practiceKeys.search(q),
    queryFn: () => api.get<SearchResults>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
  });
}

export type ReportReason = 'wrong_answer' | 'typo' | 'unclear' | 'outdated' | 'other';

export function useReportQuestion(id: string) {
  return useMutation({
    mutationFn: (input: { reason: ReportReason; message: string | null }) =>
      api.post(`/questions/${id}/reports`, input),
    onSuccess: (_, input) => track('question_reported', { reason: input.reason }),
  });
}
