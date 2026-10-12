import { z } from 'zod';
import { CursorQuery, LocalizedText } from './common.js';
import { AccessLevel } from './content.js';

/**
 * Live classes (S22, D-072): staff schedule a class for a course on YouTube Live (unlisted) or Zoom; Free classes are
 * open to any signed-in student, Premium ones to students with access to the course. The link is only ever given
 * to a student who may join, when they join (which records attendance).
 */
export const LiveProvider = z.enum(['youtube', 'zoom']);
export type LiveProvider = z.infer<typeof LiveProvider>;
export const LiveStatus = z.enum(['scheduled', 'live', 'ended', 'cancelled']);
export type LiveStatus = z.infer<typeof LiveStatus>;

const httpsUrl = z
  .url()
  .max(500)
  .refine((u) => u.startsWith('https://'), { message: 'Use an https:// link' });

const host = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
};
const isYouTube = (url: string) => /(^|\.)(youtube\.com|youtu\.be)$/.test(host(url));
const isZoom = (url: string) => /(^|\.)(zoom\.us|zoom\.com)$/.test(host(url));

export const LiveClassInput = z
  .object({
    courseId: z.uuid(),
    title: LocalizedText,
    description: LocalizedText.nullable(),
    provider: LiveProvider,
    /** The YouTube Live (unlisted) link, or the Zoom meeting's join link. */
    joinUrl: httpsUrl,
    /** Zoom only. */
    passcode: z.string().trim().min(1).max(40).nullable(),
    startsAt: z.iso.datetime(),
    durationMinutes: z.number().int().min(5).max(600),
    accessLevel: AccessLevel,
    /** The teacher (a staff member), shown to students. */
    instructorId: z.uuid().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.provider === 'youtube' && !isYouTube(v.joinUrl)) {
      ctx.addIssue({ code: 'custom', path: ['joinUrl'], message: 'Use the YouTube link of the live stream' });
    }
    if (v.provider === 'zoom' && !isZoom(v.joinUrl)) {
      ctx.addIssue({ code: 'custom', path: ['joinUrl'], message: 'Use the Zoom meeting link (zoom.us)' });
    }
    if (v.provider === 'youtube' && v.passcode) {
      ctx.addIssue({ code: 'custom', path: ['passcode'], message: 'Only Zoom meetings have a passcode' });
    }
  });
export type LiveClassInput = z.infer<typeof LiveClassInput>;

/** The class recording (D-072): a YouTube or Bunny video; null removes it. */
export const LiveRecordingInput = z.object({
  recording: z
    .discriminatedUnion('provider', [
      z.object({ provider: z.literal('youtube'), url: z.string().trim().min(1).max(500) }),
      z.object({ provider: z.literal('bunny'), videoId: z.string().trim().min(8).max(100) }),
    ])
    .nullable(),
});
export type LiveRecordingInput = z.infer<typeof LiveRecordingInput>;

export const LiveWhen = z.enum(['upcoming', 'past']);
export type LiveWhen = z.infer<typeof LiveWhen>;

export const AdminLiveClassQuery = CursorQuery.extend({
  cursor: z.uuid().optional(),
  courseId: z.uuid().optional(),
  when: LiveWhen.optional(),
});
export type AdminLiveClassQuery = z.infer<typeof AdminLiveClassQuery>;

/** Students: a course's classes, or (without a course) the classes of the student's own courses. */
export const LiveClassQuery = CursorQuery.extend({
  cursor: z.uuid().optional(),
  courseId: z.uuid().optional(),
  when: LiveWhen.default('upcoming'),
});
export type LiveClassQuery = z.infer<typeof LiveClassQuery>;
