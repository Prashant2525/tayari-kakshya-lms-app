import { z } from 'zod';

export const Locale = z.enum(['en', 'ne']);
export type Locale = z.infer<typeof Locale>;

export const Platform = z.enum(['android', 'ios', 'web']);
export type Platform = z.infer<typeof Platform>;

export const Uuid = z.uuid();

/** Localized short text stored as JSONB `{ en?, ne? }`; at least one language is required (D-008). */
export const LocalizedText = z
  .object({
    en: z.string().trim().min(1).optional(),
    ne: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.en ?? v.ne), { message: 'At least one of en/ne is required' });
export type LocalizedText = z.infer<typeof LocalizedText>;

export const CursorQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type CursorQuery = z.infer<typeof CursorQuery>;

export function cursorPage<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), nextCursor: z.string().nullable() });
}

/** E.164 phone, e.g. +9779812345678. */
export const PhoneE164 = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format, e.g. +9779812345678');
