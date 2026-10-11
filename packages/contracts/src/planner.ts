import { z } from 'zod';

/** A student's study plan for one of their courses (S7, D-066). The exam date is an AD date (shown in BS). */
export const StudyPlanInput = z.object({
  examDate: z.iso.date(),
  minutesPerDay: z.number().int().min(10).max(600),
});
export type StudyPlanInput = z.infer<typeof StudyPlanInput>;

const Localized = z.record(z.string(), z.string());

export const PlanTaskView = z.object({
  /** Lesson (learning item) or test (assessment) id. */
  id: z.string(),
  kind: z.enum(['lesson', 'test']),
  /** note / pdf / video for lessons; the assessment type for tests. */
  type: z.string(),
  title: Localized,
  subjectId: z.string().nullable(),
  subject: Localized.nullable(),
  minutes: z.number().int(),
  done: z.boolean(),
});
export type PlanTaskView = z.infer<typeof PlanTaskView>;

export const PlanDayView = z.object({
  day: z.string(),
  minutes: z.number().int(),
  tasks: z.array(PlanTaskView),
});
export type PlanDayView = z.infer<typeof PlanDayView>;

const PlanHeader = z.object({
  courseId: z.string(),
  course: z.object({ title: Localized, slug: z.string() }),
  examDate: z.string(),
  minutesPerDay: z.number().int(),
  /** False once the student no longer has the course: the plan is kept but shows nothing to do. */
  access: z.boolean(),
  /** Days to study: today up to the day before the exam. */
  studyDays: z.number().int(),
  minutesLeft: z.number().int(),
  lessonsLeft: z.number().int(),
  testsLeft: z.number().int(),
  neededMinutesPerDay: z.number().int().nullable(),
  onTrack: z.boolean(),
});

/** `GET /me/study-plans/:courseId`: the whole plan, day by day. */
export const StudyPlanView = PlanHeader.extend({
  days: z.array(PlanDayView),
  /** Work that does not fit before the exam at this pace. */
  unscheduled: z.array(PlanTaskView),
});
export type StudyPlanView = z.infer<typeof StudyPlanView>;

/** `GET /me/study-plans`: each plan with today's work only. */
export const StudyPlanSummary = PlanHeader.extend({ today: PlanDayView.nullable() });
export type StudyPlanSummary = z.infer<typeof StudyPlanSummary>;
