import { z } from 'zod';
import { LocalizedRichDoc } from './rich-text.js';

/**
 * Static pages (D-038), FAQs and contact options (D-034, D-064): the "Help & support" area of the app and website,
 * and the legal pages. All CMS data.
 */

export const PageSlug = z.enum(['about', 'terms', 'privacy', 'refund']);
export type PageSlug = z.infer<typeof PageSlug>;

const PlainText = (max: number) =>
  z
    .object({
      en: z.string().trim().min(1).max(max).optional(),
      ne: z.string().trim().min(1).max(max).optional(),
    })
    .strict()
    .refine((v) => Boolean(v.en ?? v.ne), { message: 'At least one of en/ne is required' });

/** The working copy staff edit; readers see the last published version. */
export const PageInput = z.object({ title: PlainText(120), body: LocalizedRichDoc });
export type PageInput = z.infer<typeof PageInput>;

export const FaqInput = z.object({
  question: PlainText(300),
  answer: PlainText(3000),
  sortOrder: z.number().int().min(0).max(9999),
  active: z.boolean(),
  /** D-027 / D-061: answers that mention buying are not shown in the iPhone app. */
  hideOnIos: z.boolean(),
});
export type FaqInput = z.infer<typeof FaqInput>;

export const ContactType = z.enum(['phone', 'whatsapp', 'viber', 'email', 'website', 'facebook', 'address']);
export type ContactType = z.infer<typeof ContactType>;

const PHONE = /^\+?[0-9][0-9 -]{6,18}[0-9]$/;

export const ContactOptionInput = z
  .object({
    type: ContactType,
    label: PlainText(80),
    value: z.string().trim().min(1).max(300),
    /** e.g. "Sunday–Friday, 10am–5pm". */
    note: PlainText(160).nullable(),
    sortOrder: z.number().int().min(0).max(9999),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: 'custom', path: ['value'], message });
    if (['phone', 'whatsapp', 'viber'].includes(v.type) && !PHONE.test(v.value)) {
      bad('Enter a phone number, e.g. +977 9800000000');
    }
    if (v.type === 'email' && !z.email().safeParse(v.value).success) bad('Enter an email address');
    if ((v.type === 'website' || v.type === 'facebook') && !/^https:\/\/\S+$/.test(v.value)) {
      bad('Enter an https:// link');
    }
  });
export type ContactOptionInput = z.infer<typeof ContactOptionInput>;
