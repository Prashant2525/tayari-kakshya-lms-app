import { z } from 'zod';
import { CursorQuery, LocalizedText } from './common.js';
import { PublishStatus, Slug, StatusChangeInput } from './content.js';
import { LocalizedRichDoc } from './rich-text.js';

/**
 * Articles (§12, D-018, D-063): current affairs digests, Gorkhapatra summaries (written by the team, with the paper's
 * date and a source link — never the paper itself), news and blog. Free for everyone, in the app and on the website.
 */

export const ArticleKind = z.enum(['current_affairs', 'gorkhapatra', 'news', 'blog']);
export type ArticleKind = z.infer<typeof ArticleKind>;

/** Current affairs come as daily, weekly, monthly or yearly digests. */
export const ArticlePeriod = z.enum(['daily', 'weekly', 'monthly', 'yearly']);
export type ArticlePeriod = z.infer<typeof ArticlePeriod>;

const PlainText = (max: number) =>
  z
    .object({
      en: z.string().trim().min(1).max(max).optional(),
      ne: z.string().trim().min(1).max(max).optional(),
    })
    .strict()
    .refine((v) => Boolean(v.en ?? v.ne), { message: 'At least one of en/ne is required' });

const IsoDate = z.iso.date();

export const ArticleInput = z
  .object({
    kind: ArticleKind,
    /** The address on the website: /articles/<slug>. */
    slug: Slug.min(3, 'At least 3 characters'),
    title: PlainText(200),
    /** For lists and search results; made from the text when left empty. */
    summary: PlainText(400).nullable(),
    body: LocalizedRichDoc,
    coverMediaId: z.uuid().nullable(),
    categoryId: z.uuid().nullable(),
    /** Current affairs only. */
    period: ArticlePeriod.nullable(),
    /** The day (or first day of the week / month / year) the digest covers, or the Gorkhapatra issue date. */
    periodDate: IsoDate.nullable(),
    sourceName: z.string().trim().min(1).max(120).nullable(),
    sourceUrl: z
      .url()
      .max(500)
      .refine((u) => u.startsWith('https://'), { message: 'Use an https:// link' })
      .nullable(),
    /** A published quiz to practise what the article covers. */
    quizAssessmentId: z.uuid().nullable(),
    isFeatured: z.boolean(),
    /** D-063: also push and email when it goes live (each student's choices still apply). */
    notify: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'current_affairs') {
      if (!v.period)
        ctx.addIssue({
          code: 'custom',
          path: ['period'],
          message: 'Choose daily, weekly, monthly or yearly',
        });
      if (!v.periodDate)
        ctx.addIssue({ code: 'custom', path: ['periodDate'], message: 'Choose the date it covers' });
    } else if (v.period) {
      ctx.addIssue({ code: 'custom', path: ['period'], message: 'Only current affairs have a period' });
    }
    if (v.kind === 'gorkhapatra') {
      // D-018: our own summary of the day's paper, with its date and a link to the source.
      if (!v.periodDate)
        ctx.addIssue({ code: 'custom', path: ['periodDate'], message: 'Choose the issue date' });
      if (!v.sourceUrl) ctx.addIssue({ code: 'custom', path: ['sourceUrl'], message: 'Add the source link' });
    }
  });
export type ArticleInput = z.infer<typeof ArticleInput>;

export const ArticleStatusInput = StatusChangeInput;
export type ArticleStatusInput = z.infer<typeof ArticleStatusInput>;

export const AdminArticleQuery = CursorQuery.extend({
  kind: ArticleKind.optional(),
  status: PublishStatus.optional(),
  q: z.string().trim().min(1).max(120).optional(),
});
export type AdminArticleQuery = z.infer<typeof AdminArticleQuery>;

/** Public list (app and website). */
export const ArticleQuery = CursorQuery.extend({
  kind: ArticleKind.optional(),
  categoryId: z.uuid().optional(),
  period: ArticlePeriod.optional(),
  featured: z.enum(['true', 'false']).optional(),
});
export type ArticleQuery = z.infer<typeof ArticleQuery>;

export const ArticleCategoryInput = z.object({
  kind: ArticleKind,
  name: LocalizedText,
  sortOrder: z.number().int().min(0).max(9999),
  active: z.boolean(),
});
export type ArticleCategoryInput = z.infer<typeof ArticleCategoryInput>;
