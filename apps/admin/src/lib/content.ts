import type { ExamNodeType, LocalizedText, PublishStatus } from '@tk/contracts';

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
  nodeType: ExamNodeType;
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

export const NODE_TYPE_LABEL: Record<ExamNodeType, string> = {
  authority: 'Authority',
  level: 'Level',
  service: 'Service',
  group: 'Group',
  post: 'Post',
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
