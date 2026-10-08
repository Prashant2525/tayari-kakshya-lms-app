import { z } from 'zod';

/** What a student was doing while the app counted study time (D-066): idle time is never counted. */
export const StudyActivity = z.enum(['video', 'reading', 'practice', 'test']);
export type StudyActivity = z.infer<typeof StudyActivity>;

/**
 * A piece of study time the app measured. The server never credits more than the time that has passed since the
 * student's previous report, so a client cannot inflate it.
 */
export const StudyTimeInput = z.object({
  activity: StudyActivity,
  seconds: z.number().int().min(1).max(300),
});
export type StudyTimeInput = z.infer<typeof StudyTimeInput>;

const Localized = z.record(z.string(), z.string());

/** Answers counted for accuracy: auto-marked practice and revision answers, and released test answers. */
export const AnswerTally = z.object({
  answered: z.number().int(),
  correct: z.number().int(),
  partial: z.number().int(),
  wrong: z.number().int(),
  /** (correct + ½ partial) ÷ answered, as a whole percent; null with no answers. */
  accuracy: z.number().int().nullable(),
});
export type AnswerTally = z.infer<typeof AnswerTally>;

export const StudyDay = z.object({
  /** Nepal calendar day, `YYYY-MM-DD`. */
  day: z.string(),
  seconds: z.object({ video: z.number(), reading: z.number(), practice: z.number(), test: z.number() }),
});
export type StudyDay = z.infer<typeof StudyDay>;

export const TopicStanding = AnswerTally.extend({
  topicId: z.string(),
  topic: Localized,
  subjectId: z.string(),
  subject: Localized,
});
export type TopicStanding = z.infer<typeof TopicStanding>;

/** `GET /me/progress` — the student's own progress analytics (S8, D-066). */
export const ProgressSummary = z.object({
  studyTime: z.object({
    /** The last 7 Nepal days, oldest first, today last. */
    days: z.array(StudyDay),
    todaySeconds: z.number(),
    weekSeconds: z.number(),
    monthSeconds: z.number(),
  }),
  lessons: z.object({ finishedThisWeek: z.number().int(), finished: z.number().int() }),
  /** Accuracy over the last `windowDays` days. */
  windowDays: z.number().int(),
  accuracy: AnswerTally,
  subjects: z.array(AnswerTally.extend({ subjectId: z.string(), subject: Localized })),
  /** Topics with at least `minAnswers` answers below the weak line, weakest first. */
  weakTopics: z.array(TopicStanding),
  /** Topics with at least `minAnswers` answers at or above the strong line, strongest first. */
  strongTopics: z.array(TopicStanding),
  thresholds: z.object({
    minAnswers: z.number().int(),
    weakBelow: z.number().int(),
    strongFrom: z.number().int(),
  }),
  /** Released results of the latest completed tests, newest first. */
  tests: z.array(
    z.object({
      attemptId: z.string(),
      title: Localized,
      submittedAt: z.string(),
      percent: z.number().int(),
      passed: z.boolean().nullable(),
    }),
  ),
});
export type ProgressSummary = z.infer<typeof ProgressSummary>;
