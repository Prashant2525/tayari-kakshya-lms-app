import type { LocalizedText, PublishStatus } from '@tk/contracts';

/** Media library asset as returned by `/admin/media`. Private files carry a short-lived signed URL. */
export interface MediaView {
  id: string;
  kind: 'image' | 'pdf';
  visibility: 'public' | 'private';
  url: string;
  variants: Record<string, string>;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  pageCount: number | null;
  altText: LocalizedText | null;
  createdAt: string;
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
}

export interface ExamNode {
  id: string;
  parentId: string | null;
  /** Category type key (admin-managed); see `useNodeTypes`. */
  nodeType: string;
  name: LocalizedText;
  slug: string;
  description: LocalizedText | null;
  iconMediaId: string | null;
  iconUrl: string | null;
  sortOrder: number;
  status: PublishStatus;
  deletedAt: string | null;
  courseCount: number;
  paperCount: number;
}

export interface Paper {
  id: string;
  name: LocalizedText;
  code: string | null;
  fullMarks: number | null;
  passMarks: number | null;
  durationMinutes: number | null;
  pattern: LocalizedText | null;
  status: PublishStatus;
  deletedAt: string | null;
  posts: Array<{ id: string; name: LocalizedText }>;
}

export const STATUS_LABEL: Record<PublishStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  scheduled: 'Scheduled',
  published: 'Published',
  archived: 'Archived',
};

/** Builds a LocalizedText from two optional inputs; null when both are empty. */
export function toLocalized(
  en: string | undefined | null,
  ne: string | undefined | null,
): LocalizedText | null {
  const e = en?.trim();
  const n = ne?.trim();
  if (!e && !n) return null;
  return { ...(e ? { en: e } : {}), ...(n ? { ne: n } : {}) };
}

/** URL slug from an English title: lowercase, hyphen-separated, ASCII only. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Smallest variant that is at least `minWidth` wide, falling back to the original. */
export function imageVariant(media: Pick<MediaView, 'url' | 'variants'>, minWidth = 320): string {
  const sizes = Object.entries(media.variants)
    .map(([k, url]) => ({ width: Number(k.replace(/\D/g, '')), url }))
    .filter((v) => v.width >= minWidth)
    .sort((a, b) => a.width - b.width);
  return sizes[0]?.url ?? media.url;
}

export type ItemType = 'note' | 'pdf' | 'video';
export type AccessLevel = 'free' | 'premium';

export interface SubjectRow {
  id: string;
  name: LocalizedText;
  summary: LocalizedText | null;
  iconUrl: string | null;
  status: PublishStatus;
  deletedAt: string | null;
  chapterCount: number;
  courseCount: number;
  updatedAt: string;
}

export interface ItemSummary {
  id: string;
  type: ItemType;
  title: LocalizedText;
  status: PublishStatus;
  accessLevel: AccessLevel;
  publishAt: string | null;
  durationSeconds: number | null;
  sortOrder: number;
}

export interface TopicNode {
  id: string;
  numberLabel: string | null;
  title: LocalizedText;
  description: LocalizedText | null;
  estimatedMinutes: number | null;
  status: PublishStatus;
  items: ItemSummary[];
}

export interface ChapterNode extends Omit<TopicNode, 'items'> {
  topics: TopicNode[];
}

export interface SubjectTree {
  id: string;
  name: LocalizedText;
  summary: LocalizedText | null;
  iconMediaId: string | null;
  iconUrl: string | null;
  status: PublishStatus;
  chapters: ChapterNode[];
}

/** `/admin/learning-items/:id`. */
export interface LearningItemAdmin {
  id: string;
  topicId: string;
  type: ItemType;
  title: LocalizedText;
  accessLevel: AccessLevel;
  language: 'en' | 'ne' | 'both';
  status: PublishStatus;
  publishAt: string | null;
  sortOrder: number;
  noteContent: { en?: unknown; ne?: unknown } | null;
  pdf: MediaView | null;
  downloadable: boolean;
  video: {
    id: string;
    provider: 'youtube' | 'bunny';
    providerVideoId: string;
    status: string;
    title: string | null;
    thumbnailUrl: string | null;
  } | null;
  durationSeconds: number | null;
  updatedAt: string;
}

export const ITEM_TYPE_LABEL: Record<ItemType, string> = { note: 'Note', pdf: 'PDF', video: 'Video' };

/** "1:05:09" / "4:05" from seconds. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** Parses "75", "4:05" or "1:05:09" into seconds; null when empty, NaN when invalid. */
export function parseDuration(input: string): number | null {
  const v = input.trim();
  if (!v) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(v)) return Number.NaN;
  const parts = v.split(':').map(Number);
  if (parts.slice(1).some((p) => p >= 60)) return Number.NaN;
  return parts.reduce((total, p) => total * 60 + p, 0);
}

/** Nepal Standard Time is UTC+05:45; `datetime-local` values are entered as Nepal time. */
export function nepalLocalToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}:00+05:45`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isoToNepalLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const shifted = new Date(new Date(iso).getTime() + (5 * 60 + 45) * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export interface CourseRow {
  id: string;
  slug: string;
  title: LocalizedText;
  thumbnailUrl: string | null;
  status: PublishStatus;
  publishAt: string | null;
  pricePaisa: number;
  salePricePaisa: number | null;
  isFeatured: boolean;
  subjectCount: number;
  deletedAt: string | null;
  updatedAt: string;
}

export interface CoursePricing {
  pricePaisa: number;
  salePricePaisa: number | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  validityType: 'days' | 'fixed_date' | 'lifetime';
  validityDays: number | null;
  validityEndsOn: string | null;
}

export interface CourseSubjectLink {
  subjectId: string;
  name: LocalizedText;
  subjectStatus: PublishStatus;
  paperId: string | null;
  paperName: LocalizedText | null;
  displayFullMarks: number | null;
  displayPassMarks: number | null;
  displayDurationMinutes: number | null;
}

export interface CourseDetail {
  id: string;
  slug: string;
  title: LocalizedText;
  shortDescription: LocalizedText | null;
  description: { en?: unknown; ne?: unknown } | null;
  thumbnailMediaId: string | null;
  thumbnailUrl: string | null;
  language: 'en' | 'ne' | 'both';
  isFeatured: boolean;
  popularityRank: number | null;
  status: PublishStatus;
  publishAt: string | null;
  pricing: CoursePricing;
  subjects: CourseSubjectLink[];
  examNodes: Array<{ id: string; name: LocalizedText; nodeType: string }>;
  instructors: Array<{ id: string; fullName: string }>;
  activeStudents: number;
  certificateTemplateId: string | null;
}

export interface InstructorRow {
  userId: string;
  fullName: string;
  email: string;
  profile: {
    displayName: LocalizedText;
    bio: LocalizedText | null;
    photoMediaId: string | null;
    photoUrl: string | null;
    isPublic: boolean;
  } | null;
}

/** "3000" / "2999.50" for a rupee input, from paisa. */
export function paisaToRupeesInput(paisa: number | null | undefined): string {
  if (paisa === null || paisa === undefined) return '';
  return paisa % 100 === 0 ? String(paisa / 100) : (paisa / 100).toFixed(2);
}
