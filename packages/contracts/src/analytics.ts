import { z } from 'zod';

/**
 * Admin dashboards and exports (Phase 13e, D-066): a period of Nepal calendar days, `from`–`to` inclusive (default:
 * the last 30 days), at most 366 days.
 */
export const AnalyticsRange = z
  .object({ from: z.iso.date().optional(), to: z.iso.date().optional() })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'The start must not be after the end',
    path: ['from'],
  });
export type AnalyticsRange = z.infer<typeof AnalyticsRange>;

/** CSV downloads (D-066), each gated by the permission that already shows that data. */
export const ExportKind = z.enum(['orders', 'students', 'enrolments', 'test-results']);
export type ExportKind = z.infer<typeof ExportKind>;
