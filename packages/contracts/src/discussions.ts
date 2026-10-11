import { z } from 'zod';
import { CursorQuery } from './common.js';

/**
 * Discussions / doubts (S12, D-066): one thread under each practice / test question (opened once the student has
 * seen its answer) and under each lesson. Students and staff post; staff replies carry a badge and staff mark a
 * best answer; students report posts; staff hide them and can stop a student posting.
 */
export const DiscussionTarget = z.enum(['question', 'lesson']);
export type DiscussionTarget = z.infer<typeof DiscussionTarget>;

export const DiscussionPostInput = z.object({
  body: z.string().trim().min(2).max(2000),
  /** A reply to this top-level post (one level of replies). */
  parentId: z.uuid().nullable().optional(),
});
export type DiscussionPostInput = z.infer<typeof DiscussionPostInput>;

export const ReportReason = z.enum(['spam', 'rude', 'wrong', 'other']);
export type ReportReason = z.infer<typeof ReportReason>;

export const ReportPostInput = z.object({
  reason: ReportReason,
  message: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});
export type ReportPostInput = z.infer<typeof ReportPostInput>;

export const HidePostInput = z.object({ reason: z.string().trim().min(3).max(300) });
export type HidePostInput = z.infer<typeof HidePostInput>;

/** Stop a student posting until a time, or with no end (`until: null`). */
export const DiscussionBanInput = z.object({
  until: z.iso.datetime().nullable(),
  reason: z.string().trim().min(3).max(300),
});
export type DiscussionBanInput = z.infer<typeof DiscussionBanInput>;

export const AdminDiscussionQuery = CursorQuery.extend({
  view: z.enum(['reported', 'recent', 'hidden']).default('reported'),
});
export type AdminDiscussionQuery = z.infer<typeof AdminDiscussionQuery>;

export const DiscussionPostView = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  body: z.string(),
  /** As the CMS shows names (`discussions.rules.names`); a teacher's name for staff. */
  author: z.string(),
  /** Written by staff (shown with a Teacher badge). */
  staff: z.boolean(),
  mine: z.boolean(),
  best: z.boolean(),
  /** Deleted by its author or erased with the account: kept as a placeholder when it has replies. */
  deleted: z.boolean(),
  createdAt: z.string(),
  replies: z.array(z.lazy((): z.ZodType => DiscussionPostView)).optional(),
});
export type DiscussionPostView = {
  id: string;
  parentId: string | null;
  body: string;
  author: string;
  staff: boolean;
  mine: boolean;
  best: boolean;
  deleted: boolean;
  createdAt: string;
  replies?: DiscussionPostView[];
};
