import { z } from 'zod';
import { CursorQuery } from './common.js';

/** Course reviews (S4, D-066): stars and an optional text, shown only after staff approve them. */
export const ReviewStatus = z.enum(['pending', 'approved', 'rejected']);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

export const ReviewInput = z.object({
  rating: z.number().int().min(1).max(5),
  body: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});
export type ReviewInput = z.infer<typeof ReviewInput>;

export const RejectReviewInput = z.object({ reason: z.string().trim().min(3).max(500) });
export type RejectReviewInput = z.infer<typeof RejectReviewInput>;

export const AdminReviewQuery = CursorQuery.extend({
  status: ReviewStatus.optional(),
  courseId: z.uuid().optional(),
});
export type AdminReviewQuery = z.infer<typeof AdminReviewQuery>;

/** Average of approved reviews (one decimal) and how many there are. */
export const RatingSummary = z.object({ average: z.number(), count: z.number().int() });
export type RatingSummary = z.infer<typeof RatingSummary>;

export const PublicReview = z.object({
  id: z.string(),
  rating: z.number().int(),
  body: z.string().nullable(),
  /** As the CMS chooses (`reviews.rules.names`); null when names are not shown. */
  author: z.string().nullable(),
  createdAt: z.string(),
});
export type PublicReview = z.infer<typeof PublicReview>;
