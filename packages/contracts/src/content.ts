import { z } from 'zod';
import { CursorQuery, LocalizedText } from './common.js';
import { LocalizedRichDoc } from './rich-text.js';

// ───────────── Shared ─────────────

export const PublishStatus = z.enum(['draft', 'in_review', 'scheduled', 'published', 'archived']);
export type PublishStatus = z.infer<typeof PublishStatus>;
export const AccessLevel = z.enum(['free', 'premium']);
export type AccessLevel = z.infer<typeof AccessLevel>;
export const ContentLanguage = z.enum(['en', 'ne', 'both']);
/**
 * Category type key (admin-managed, DYNAMIC_ADMIN_AUDIT §4.1), e.g. "authority", "post", "exam_stage".
 * Hierarchy rules (rank, top level, papers) live in the `exam_node_types` table, not in code.
 */
export const ExamNodeType = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, 'Use lowercase letters, digits and _');
export type ExamNodeType = z.infer<typeof ExamNodeType>;

export const ExamNodeTypeInput = z.object({
  key: ExamNodeType,
  name: LocalizedText,
  description: LocalizedText.nullable().optional(),
  /** Lower rank = higher in the hierarchy; a child must have a higher rank than its parent. */
  rank: z.number().int().min(1).max(1000),
  topLevel: z.boolean().default(false),
  canHavePapers: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type ExamNodeTypeInput = z.infer<typeof ExamNodeTypeInput>;

export const Slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens')
  .max(80);

const OptionalLocalized = LocalizedText.nullable().optional();
const Marks = z.number().min(0).max(9999.99).multipleOf(0.01);

/**
 * Publishing: editors move content between draft and in_review; `content:publish` / `courses:publish` is needed
 * for scheduled, published and archived. Scheduled content becomes visible when publishAt passes.
 */
export const StatusChangeInput = z
  .object({ status: PublishStatus, publishAt: z.iso.datetime().nullable().optional() })
  .refine((v) => v.status !== 'scheduled' || Boolean(v.publishAt), {
    path: ['publishAt'],
    message: 'Scheduled content needs a publish date and time',
  });
export type StatusChangeInput = z.infer<typeof StatusChangeInput>;

export const ReorderIdsInput = z.object({ ids: z.array(z.uuid()).min(1).max(1000) });

export const AdminListQuery = CursorQuery.extend({
  cursor: z.uuid().optional(),
  q: z.string().trim().max(120).optional(),
  status: PublishStatus.optional(),
  includeDeleted: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type AdminListQuery = z.infer<typeof AdminListQuery>;

// ───────────── Media ─────────────

export const MediaUploadFields = z.object({
  visibility: z.enum(['public', 'private']),
  altEn: z.string().trim().max(300).optional(),
  altNe: z.string().trim().max(300).optional(),
});
export const MediaListQuery = CursorQuery.extend({
  cursor: z.uuid().optional(),
  kind: z.enum(['image', 'pdf']).optional(),
  q: z.string().trim().max(120).optional(),
});
export type MediaListQuery = z.infer<typeof MediaListQuery>;

// ───────────── Taxonomy ─────────────

export const ExamNodeInput = z.object({
  parentId: z.uuid().nullable(),
  nodeType: ExamNodeType,
  name: LocalizedText,
  slug: Slug,
  description: OptionalLocalized,
  iconMediaId: z.uuid().nullable().optional(),
});
export type ExamNodeInput = z.infer<typeof ExamNodeInput>;

/** Onboarding (S1): the exams a student is preparing for. Any published category can be chosen. */
export const TARGET_POSTS_MAX = 5;
export const TargetPostsInput = z.object({
  examNodeIds: z
    .array(z.uuid())
    .max(TARGET_POSTS_MAX)
    .refine((ids) => new Set(ids).size === ids.length, 'Each category can be chosen once'),
});
export type TargetPostsInput = z.infer<typeof TargetPostsInput>;

/** Student progress in a learning item: video seconds or PDF page, and/or finished. */
export const LearningProgressInput = z
  .object({
    /** The course the item was opened from (remembered for "Continue"). */
    courseId: z.uuid().optional(),
    position: z.number().int().min(0).max(1_000_000).optional(),
    completed: z.literal(true).optional(),
  })
  .strict()
  .refine((v) => v.position !== undefined || v.completed !== undefined, 'Send a position or completed');
export type LearningProgressInput = z.infer<typeof LearningProgressInput>;

export const PaperInput = z
  .object({
    name: LocalizedText,
    code: z.string().trim().max(40).nullable().optional(),
    fullMarks: Marks.nullable().optional(),
    passMarks: Marks.nullable().optional(),
    durationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
    pattern: OptionalLocalized,
    postIds: z.array(z.uuid()).max(200).default([]),
  })
  .refine((v) => v.fullMarks == null || v.passMarks == null || v.passMarks <= v.fullMarks, {
    path: ['passMarks'],
    message: 'Pass marks cannot exceed full marks',
  });
export type PaperInput = z.infer<typeof PaperInput>;

// ───────────── Content tree ─────────────

export const SubjectInput = z.object({
  name: LocalizedText,
  summary: OptionalLocalized,
  iconMediaId: z.uuid().nullable().optional(),
});
export type SubjectInput = z.infer<typeof SubjectInput>;

export const ChapterInput = z.object({
  numberLabel: z.string().trim().max(20).nullable().optional(),
  title: LocalizedText,
  description: OptionalLocalized,
  estimatedMinutes: z.number().int().min(1).max(100_000).nullable().optional(),
});
export type ChapterInput = z.infer<typeof ChapterInput>;
export const TopicInput = ChapterInput;
export type TopicInput = ChapterInput;

const ItemBase = {
  title: LocalizedText,
  accessLevel: AccessLevel,
  language: ContentLanguage.default('both'),
};

export const LearningItemInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('note'), ...ItemBase, noteContent: LocalizedRichDoc }),
  z.object({
    type: z.literal('pdf'),
    ...ItemBase,
    pdfMediaId: z.uuid(),
    downloadable: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('video'),
    ...ItemBase,
    video: z.discriminatedUnion('provider', [
      z.object({ provider: z.literal('youtube'), url: z.string().trim().max(500) }),
      z.object({ provider: z.literal('bunny'), videoId: z.string().trim().min(8).max(100) }),
    ]),
    durationSeconds: z.number().int().min(1).max(86_400).nullable().optional(),
  }),
]);
export type LearningItemInput = z.infer<typeof LearningItemInput>;

// ───────────── Courses ─────────────

export const CourseInput = z.object({
  slug: Slug,
  title: LocalizedText,
  shortDescription: OptionalLocalized,
  description: LocalizedRichDoc.nullable().optional(),
  thumbnailMediaId: z.uuid().nullable().optional(),
  language: ContentLanguage.default('both'),
  isFeatured: z.boolean().default(false),
  popularityRank: z.number().int().min(1).max(10_000).nullable().optional(),
});
export type CourseInput = z.infer<typeof CourseInput>;

/** Prices are entered by admins (D-023); all amounts are integer paisa. */
export const CoursePricingInput = z
  .object({
    pricePaisa: z.number().int().min(0).max(100_000_000),
    salePricePaisa: z.number().int().min(0).nullable(),
    saleStartsAt: z.iso.datetime().nullable(),
    saleEndsAt: z.iso.datetime().nullable(),
    validityType: z.enum(['days', 'fixed_date', 'lifetime']),
    validityDays: z.number().int().min(1).max(3650).nullable(),
    validityEndsOn: z.iso.date().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.salePricePaisa != null && v.salePricePaisa > v.pricePaisa) {
      ctx.addIssue({
        code: 'custom',
        path: ['salePricePaisa'],
        message: 'Sale price cannot exceed the price',
      });
    }
    if (v.saleStartsAt && v.saleEndsAt && v.saleStartsAt >= v.saleEndsAt) {
      ctx.addIssue({ code: 'custom', path: ['saleEndsAt'], message: 'Sale must end after it starts' });
    }
    if (v.validityType === 'days' && !v.validityDays) {
      ctx.addIssue({ code: 'custom', path: ['validityDays'], message: 'Enter the number of days' });
    }
    if (v.validityType === 'fixed_date' && !v.validityEndsOn) {
      ctx.addIssue({ code: 'custom', path: ['validityEndsOn'], message: 'Enter the end date' });
    }
  });
export type CoursePricingInput = z.infer<typeof CoursePricingInput>;

export const CourseSubjectsInput = z.object({
  subjects: z
    .array(
      z.object({
        subjectId: z.uuid(),
        paperId: z.uuid().nullable().optional(),
        displayFullMarks: Marks.nullable().optional(),
        displayPassMarks: Marks.nullable().optional(),
        displayDurationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
      }),
    )
    .max(100),
});
export type CourseSubjectsInput = z.infer<typeof CourseSubjectsInput>;

export const CourseLinksInput = z.object({
  examNodeIds: z.array(z.uuid()).max(100),
  instructorIds: z.array(z.uuid()).max(30),
});
export type CourseLinksInput = z.infer<typeof CourseLinksInput>;

export const InstructorProfileInput = z.object({
  displayName: LocalizedText,
  bio: OptionalLocalized,
  photoMediaId: z.uuid().nullable().optional(),
  isPublic: z.boolean().default(true),
});
export type InstructorProfileInput = z.infer<typeof InstructorProfileInput>;

// ───────────── Entitlements ─────────────

export const GrantCourseAccessInput = z.object({
  courseId: z.uuid(),
  /** Null = lifetime; otherwise the course's validity is the admin's choice for this grant. */
  endsAt: z.iso.datetime().nullable(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type GrantCourseAccessInput = z.infer<typeof GrantCourseAccessInput>;

export const RevokeEntitlementInput = z.object({ reason: z.string().trim().min(3).max(500) });
