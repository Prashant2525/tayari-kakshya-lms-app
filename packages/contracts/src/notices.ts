import { z } from 'zod';
import { CursorQuery, LocalizedText } from './common.js';
import { PublishStatus, StatusChangeInput } from './content.js';
import { LocalizedRichDoc } from './rich-text.js';

/** Notices (D-019, D-060) and notifications (D-033). */

export const NoticeKind = z.enum(['official', 'announcement', 'instructor']);
export type NoticeKind = z.infer<typeof NoticeKind>;

export const NoticeInput = z.object({
  kind: NoticeKind,
  title: LocalizedText,
  body: LocalizedRichDoc,
  isPinned: z.boolean(),
  /** After this, the notice leaves the Notice tab (null = stays). */
  expiresAt: z.iso.datetime().nullable(),
  /** D-060: also push to phones and email when it goes live (each student's preferences still apply). */
  notify: z.boolean(),
});
export type NoticeInput = z.infer<typeof NoticeInput>;

export const NoticeStatusInput = StatusChangeInput;
export type NoticeStatusInput = z.infer<typeof NoticeStatusInput>;

export const AdminNoticeQuery = CursorQuery.extend({
  status: PublishStatus.optional(),
  q: z.string().trim().min(1).max(120).optional(),
});
export type AdminNoticeQuery = z.infer<typeof AdminNoticeQuery>;

/** Plain text in either language, at most `max` characters (at least one language). */
const PlainText = (max: number) =>
  z
    .object({
      en: z.string().trim().min(1).max(max).optional(),
      ne: z.string().trim().min(1).max(max).optional(),
    })
    .strict()
    .refine((v) => Boolean(v.en ?? v.ne), { message: 'At least one of en/ne is required' });

/** D-060: staff tell a course's students about an update (sent at once; each student's preferences apply). */
export const CourseUpdateInput = z.object({ title: PlainText(120), message: PlainText(1000) });
export type CourseUpdateInput = z.infer<typeof CourseUpdateInput>;

/** What students can choose to hear about (D-033); the in-app list always shows everything. */
export const NotificationCategory = z.enum([
  'notice',
  'course_update',
  'exam_reminder',
  'result',
  'purchase',
]);
export type NotificationCategory = z.infer<typeof NotificationCategory>;

const Channels = z.object({ push: z.boolean(), email: z.boolean() });
export const NotificationPreferencesInput = z.object({
  notice: Channels,
  course_update: Channels,
  exam_reminder: Channels,
  result: Channels,
  purchase: Channels,
});
export type NotificationPreferencesInput = z.infer<typeof NotificationPreferencesInput>;

/** An Expo push token for this device (registered after the student allows notifications). */
export const PushTokenInput = z.object({
  token: z
    .string()
    .trim()
    .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/, 'Not an Expo push token'),
  platform: z.enum(['android', 'ios']),
});
export type PushTokenInput = z.infer<typeof PushTokenInput>;

export const NotificationsQuery = CursorQuery;
export type NotificationsQuery = z.infer<typeof NotificationsQuery>;

export const MarkNotificationsReadInput = z.object({
  /** Empty = all of the student's notifications. */
  ids: z.array(z.uuid()).max(200),
});
export type MarkNotificationsReadInput = z.infer<typeof MarkNotificationsReadInput>;
