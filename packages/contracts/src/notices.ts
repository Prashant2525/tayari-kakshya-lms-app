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
  /** PDFs from the media library attached to the notice, in order (D-074 / audit F-12). */
  attachmentMediaIds: z.array(z.uuid()).max(10).default([]),
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

/** D-075: who a notification campaign goes to — every active student, those with access to courses, or those preparing for exams. */
export const CampaignAudience = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({ type: z.literal('courses'), courseIds: z.array(z.uuid()).min(1).max(50) }),
  /** Students whose "preparing for" choice is one of these exam categories or anything under them. */
  z.object({ type: z.literal('exam_nodes'), examNodeIds: z.array(z.uuid()).min(1).max(50) }),
]);
export type CampaignAudience = z.infer<typeof CampaignAudience>;

/** Where tapping a campaign leads (a published course, article or notice), or nowhere. */
export const CampaignLink = z.object({ type: z.enum(['course', 'article', 'notice']), id: z.uuid() });
export type CampaignLink = z.infer<typeof CampaignLink>;

/**
 * D-075 / audit F-08: a notification campaign. In-app always; push and email as chosen — each student's
 * "Announcements" choices still apply. `excludeIos` leaves out students who use the iPhone app (messages about
 * buying, D-027).
 */
export const CampaignInput = z.object({
  title: PlainText(120),
  message: PlainText(1000),
  audience: CampaignAudience,
  link: CampaignLink.nullable().default(null),
  push: z.boolean().default(true),
  email: z.boolean().default(false),
  excludeIos: z.boolean().default(false),
});
export type CampaignInput = z.infer<typeof CampaignInput>;

/** Send now (no `sendAt`) or schedule for a later time. */
export const CampaignSendInput = z.object({ sendAt: z.iso.datetime().nullable().default(null) });
export type CampaignSendInput = z.infer<typeof CampaignSendInput>;

export const CampaignAudienceInput = z.object({
  audience: CampaignAudience,
  excludeIos: z.boolean().default(false),
});
export type CampaignAudienceInput = z.infer<typeof CampaignAudienceInput>;

export const CampaignStatus = z.enum(['draft', 'scheduled', 'sending', 'sent', 'cancelled']);
export type CampaignStatus = z.infer<typeof CampaignStatus>;

export const CampaignQuery = CursorQuery.extend({ status: CampaignStatus.optional() });
export type CampaignQuery = z.infer<typeof CampaignQuery>;

/** D-061: students on Apple devices who opened courses they cannot buy in the app. */
export const CourseInterestQuery = CursorQuery.extend({
  status: z.enum(['open', 'contacted']).optional(),
});
export type CourseInterestQuery = z.infer<typeof CourseInterestQuery>;

/** The email staff send (from the CMS template, changed if they like); it must keep the course link. */
export const CourseInterestContactInput = z.object({
  subject: z.string().trim().min(1).max(150),
  body: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .refine((v) => v.includes('{link}'), {
      message: 'Keep {link} in the message (the course on the website)',
    }),
});
export type CourseInterestContactInput = z.infer<typeof CourseInterestContactInput>;

/** What students can choose to hear about (D-033); the in-app list always shows everything. */
export const NotificationCategory = z.enum([
  'notice',
  'course_update',
  'exam_reminder',
  'result',
  'purchase',
  'article',
  'discussion',
  'live_class',
  'announcement',
]);
export type NotificationCategory = z.infer<typeof NotificationCategory>;

const Channels = z.object({ push: z.boolean(), email: z.boolean() });
export const NotificationPreferencesInput = z.object({
  notice: Channels,
  course_update: Channels,
  exam_reminder: Channels,
  result: Channels,
  purchase: Channels,
  /** Added later (D-063): older app versions do not send it. */
  article: Channels.default({ push: true, email: true }),
  /** Replies to the student's doubts (D-066): push and in-app only. */
  discussion: Channels.default({ push: true, email: false }),
  /** Live classes (D-072): scheduled, starting soon, live now. Added later: older app versions do not send it. */
  live_class: Channels.default({ push: true, email: true }),
  /** Announcements and offers from the team (D-075 campaigns). Added later: older app versions do not send it. */
  announcement: Channels.default({ push: true, email: true }),
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
