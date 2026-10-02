import { z } from 'zod';
import { CursorQuery, LocalizedText } from './common.js';
import { AccessLevel, ContentLanguage, PublishStatus } from './content.js';
import { LocalizedRichDoc, richDocText } from './rich-text.js';

// ───────────── Question bank (D-016, D-020) ─────────────

export const QuestionType = z.enum([
  'single_choice',
  'multiple_choice',
  'true_false',
  'fill_blank',
  'match',
  'numeric',
  'subjective',
]);
export type QuestionType = z.infer<typeof QuestionType>;
export const Difficulty = z.enum(['easy', 'medium', 'hard']);
export type Difficulty = z.infer<typeof Difficulty>;

/** Short stable ids for options, match items and blanks ("a", "b", "l1", "b2"). */
const ItemId = z.string().regex(/^[a-z0-9]{1,8}$/, 'Use 1–8 lowercase letters or digits');
const Choice = z.object({ id: ItemId, content: LocalizedRichDoc });

/** Marks: up to two decimals (stored as numeric(6,2)). */
export const Marks = z
  .number()
  .min(0)
  .max(9999.99)
  // Tolerates binary floating-point noise (0.29 × 100 = 28.999…).
  .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, { message: 'Use at most two decimals' });

/** Blank placeholders in the stem look like `[[b1]]`. */
export const BLANK_PATTERN = /\[\[([a-z0-9]{1,8})\]\]/g;

const Explanation = LocalizedRichDoc.nullable().optional();

/** The versioned part of a question: stem, choices and answer key. Every edit creates a new version. */
export const QuestionContent = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('single_choice'),
      stem: LocalizedRichDoc,
      options: z.array(Choice).min(2).max(10),
      correctOptionId: ItemId,
      explanation: Explanation,
    }),
    z.object({
      type: z.literal('multiple_choice'),
      stem: LocalizedRichDoc,
      options: z.array(Choice).min(2).max(10),
      correctOptionIds: z.array(ItemId).min(1).max(10),
      explanation: Explanation,
    }),
    z.object({
      type: z.literal('true_false'),
      stem: LocalizedRichDoc,
      correct: z.boolean(),
      explanation: Explanation,
    }),
    z.object({
      type: z.literal('fill_blank'),
      stem: LocalizedRichDoc,
      blanks: z
        .array(
          z.object({
            id: ItemId,
            accepted: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
            caseSensitive: z.boolean().default(false),
          }),
        )
        .min(1)
        .max(10),
      explanation: Explanation,
    }),
    z.object({
      type: z.literal('match'),
      stem: LocalizedRichDoc,
      left: z.array(Choice).min(2).max(10),
      /** May include extra distractors. */
      right: z.array(Choice).min(2).max(15),
      pairs: z.record(ItemId, ItemId),
      explanation: Explanation,
    }),
    z.object({
      type: z.literal('numeric'),
      stem: LocalizedRichDoc,
      value: z.number().finite(),
      tolerance: z.number().min(0).finite().default(0),
      unit: LocalizedText.nullable().optional(),
      explanation: Explanation,
    }),
    z.object({
      type: z.literal('subjective'),
      stem: LocalizedRichDoc,
      modelAnswer: LocalizedRichDoc,
      explanation: Explanation,
    }),
  ])
  .superRefine((q, ctx) => {
    const unique = (ids: string[], path: string) => {
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({ code: 'custom', path: [path], message: 'Ids must be unique' });
    };
    if (q.type === 'single_choice' || q.type === 'multiple_choice') {
      const ids = q.options.map((o) => o.id);
      unique(ids, 'options');
      const correct = q.type === 'single_choice' ? [q.correctOptionId] : q.correctOptionIds;
      if (correct.some((id) => !ids.includes(id))) {
        ctx.addIssue({
          code: 'custom',
          path: ['correct'],
          message: 'The correct answer must be one of the options',
        });
      }
      if (q.type === 'multiple_choice') unique(q.correctOptionIds, 'correctOptionIds');
    }
    if (q.type === 'match') {
      const left = q.left.map((o) => o.id);
      const right = q.right.map((o) => o.id);
      unique(left, 'left');
      unique(right, 'right');
      for (const id of left) {
        const target = q.pairs[id];
        if (!target || !right.includes(target)) {
          ctx.addIssue({
            code: 'custom',
            path: ['pairs', id],
            message: 'Every left item needs a matching right item',
          });
        }
      }
      if (Object.keys(q.pairs).some((id) => !left.includes(id))) {
        ctx.addIssue({ code: 'custom', path: ['pairs'], message: 'Pairs refer to an unknown left item' });
      }
    }
    if (q.type === 'fill_blank') {
      const ids = q.blanks.map((b) => b.id);
      unique(ids, 'blanks');
      const text = [q.stem.en, q.stem.ne].map((d) => (d ? richDocText(d) : '')).join('\n');
      const used = new Set([...text.matchAll(BLANK_PATTERN)].map((m) => m[1]));
      for (const id of ids) {
        if (!used.has(id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['stem'],
            message: `Put [[${id}]] in the question where the blank goes`,
          });
        }
      }
    }
  });
export type QuestionContent = z.infer<typeof QuestionContent>;

/** Previous-year-question metadata (D-020). Year in Bikram Sambat. */
export const QuestionSourceInput = z.object({
  examNodeId: z.uuid().nullable().optional(),
  paperId: z.uuid().nullable().optional(),
  yearBs: z.number().int().min(2000).max(2100).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});
export type QuestionSourceInput = z.infer<typeof QuestionSourceInput>;

export const Tag = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .transform((v) => v.replace(/\s+/g, ' '));

export const QuestionInput = z.object({
  subjectId: z.uuid(),
  topicId: z.uuid().nullable().optional(),
  groupId: z.uuid().nullable().optional(),
  difficulty: Difficulty,
  defaultMarks: Marks,
  defaultNegativeMarks: Marks.default(0),
  language: ContentLanguage.default('both'),
  accessLevel: AccessLevel,
  tags: z.array(Tag).max(30).default([]),
  sources: z.array(QuestionSourceInput).max(20).default([]),
  content: QuestionContent,
});
export type QuestionInput = z.infer<typeof QuestionInput>;

export const QuestionListQuery = CursorQuery.extend({
  cursor: z.uuid().optional(),
  q: z.string().trim().max(120).optional(),
  subjectId: z.uuid().optional(),
  topicId: z.uuid().optional(),
  type: QuestionType.optional(),
  difficulty: Difficulty.optional(),
  status: PublishStatus.optional(),
  tag: z.string().trim().max(50).optional(),
  pyq: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  includeDeleted: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type QuestionListQuery = z.infer<typeof QuestionListQuery>;

/** Passage / comprehension group shared by several questions. */
export const QuestionGroupInput = z.object({
  title: LocalizedText.nullable().optional(),
  passage: LocalizedRichDoc,
});
export type QuestionGroupInput = z.infer<typeof QuestionGroupInput>;

export const QuestionReportReason = z.enum(['wrong_answer', 'typo', 'unclear', 'outdated', 'other']);
export const QuestionReportInput = z.object({
  reason: QuestionReportReason,
  message: z.string().trim().max(1000).nullable().optional(),
});
export const ResolveReportInput = z.object({
  status: z.enum(['resolved', 'rejected']),
  note: z.string().trim().max(1000).nullable().optional(),
});
