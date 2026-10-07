import { z } from 'zod';
import { Slug } from './content.js';
import { PageSlug } from './support.js';

/**
 * Promotional banners (D-064) on the app's Home and the website's home page: a picture, a title (read aloud and shown
 * under it) and an optional link. On iPhone, banners that lead to buying are not shown (D-027).
 */

export const BannerPlacement = z.enum(['app', 'website', 'both']);
export type BannerPlacement = z.infer<typeof BannerPlacement>;

/** What a banner opens: a course, plan, article or page here, or a web address. */
export const BannerLinkType = z.enum(['none', 'course', 'plan', 'article', 'page', 'url']);
export type BannerLinkType = z.infer<typeof BannerLinkType>;

export const BannerInput = z
  .object({
    title: z
      .object({
        en: z.string().trim().min(1).max(120).optional(),
        ne: z.string().trim().min(1).max(120).optional(),
      })
      .strict()
      .refine((v) => Boolean(v.en ?? v.ne), { message: 'At least one of en/ne is required' }),
    imageMediaId: z.uuid(),
    linkType: BannerLinkType,
    /** Course / plan / article address, page name, or an https:// link; empty for none. */
    linkValue: z.string().trim().max(500),
    placement: BannerPlacement,
    startsAt: z.iso.datetime().nullable(),
    endsAt: z.iso.datetime().nullable(),
    sortOrder: z.number().int().min(0).max(9999),
    active: z.boolean(),
    /** Hide in the iPhone app, e.g. a picture that shows prices or discounts (D-027). Plan and web links always are. */
    hideOnIos: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: 'custom', path: ['linkValue'], message });
    if (v.linkType === 'none' && v.linkValue) bad('No link: leave this empty');
    if (['course', 'plan', 'article'].includes(v.linkType) && !Slug.safeParse(v.linkValue).success) {
      bad('Enter the web address name, e.g. kharidar-complete');
    }
    if (v.linkType === 'page' && !PageSlug.safeParse(v.linkValue).success) bad('Choose a page');
    if (v.linkType === 'url' && !/^https:\/\/\S+$/.test(v.linkValue)) bad('Enter an https:// link');
    if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Ends after it starts' });
    }
  });
export type BannerInput = z.infer<typeof BannerInput>;

export const BannerQuery = z.object({ placement: z.enum(['app', 'website']) });
export type BannerQuery = z.infer<typeof BannerQuery>;
