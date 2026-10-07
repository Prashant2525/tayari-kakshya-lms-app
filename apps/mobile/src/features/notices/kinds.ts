import type { NoticeKind } from '@/api/notices';

/** The label of each kind of notice (D-019). */
export const KIND_KEY = {
  official: 'notices.kind.official',
  announcement: 'notices.kind.announcement',
  instructor: 'notices.kind.instructor',
} as const satisfies Record<NoticeKind, string>;
