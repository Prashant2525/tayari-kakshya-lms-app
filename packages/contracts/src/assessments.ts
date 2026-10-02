import { z } from 'zod';
import { CursorQuery, LocalizedText } from './common.js';
import { AccessLevel, PublishStatus } from './content.js';
import { Difficulty, Marks, QuestionType } from './questions.js';
import { LocalizedRichDoc } from './rich-text.js';

// ───────────── Assessments (D-021, D-022, D-044) ─────────────

export const AssessmentType = z.enum([
  'quiz',
  'subject_test',
  'weekly',
  'mock',
  'pyq_mock',
  'daily_challenge',
]);
export type AssessmentType = z.infer<typeof AssessmentType>;
export const ResultRelease = z.enum(['immediate', 'after_close', 'manual']);
export const SubjectiveGrading = z.enum(['none', 'self', 'instructor']);

/** Scoring choices made per assessment in the CMS (D-044); the engine in @tk/domain applies them. */
export const ScoringRulesInput = z.object({
  /** Off: question/section negative marks are ignored. */
  negativeMarking: z.boolean(),
  multipleChoice: z.enum(['all_or_nothing', 'partial_if_no_wrong']),
  match: z.enum(['all_or_nothing', 'per_pair']),
  fillBlank: z.enum(['all_or_nothing', 'per_blank']),
  scoreFloor: z.enum(['none', 'zero']),
});
export type ScoringRulesInput = z.infer<typeof ScoringRulesInput>;

const Id = z.uuid().nullable().optional();
const When = z.iso.datetime().nullable().optional();

export const AssessmentInput = z
  .object({
    type: AssessmentType,
    title: LocalizedText,
    instructions: LocalizedRichDoc.nullable().optional(),
    /** Where it appears; all empty = a general assessment. */
    courseId: Id,
    subjectId: Id,
    chapterId: Id,
    topicId: Id,
    examNodeId: Id,
    accessLevel: AccessLevel,
    availability: z.enum(['always', 'window']),
    opensAt: When,
    closesAt: When,
    durationMinutes: z.number().int().min(1).max(1440).nullable(),
    maxAttempts: z.number().int().min(1).max(100).nullable(),
    passMarks: Marks.nullable(),
    scoring: ScoringRulesInput,
    shuffleQuestions: z.boolean(),
    shuffleOptions: z.boolean(),
    resultRelease: ResultRelease,
    showExplanations: z.boolean(),
    leaderboardEnabled: z.boolean(),
    subjectiveGrading: SubjectiveGrading,
    /** Daily challenge only: the Nepal calendar day it belongs to (AD date, shown in BS). */
    challengeDate: z.iso.date().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.availability === 'window') {
      if (!v.opensAt) ctx.addIssue({ code: 'custom', path: ['opensAt'], message: 'Choose when it opens' });
      if (!v.closesAt) ctx.addIssue({ code: 'custom', path: ['closesAt'], message: 'Choose when it closes' });
      if (v.opensAt && v.closesAt && v.opensAt >= v.closesAt) {
        ctx.addIssue({ code: 'custom', path: ['closesAt'], message: 'It must close after it opens' });
      }
    }
    if (v.resultRelease === 'after_close' && v.availability !== 'window') {
      ctx.addIssue({
        code: 'custom',
        path: ['resultRelease'],
        message: 'Results "after it closes" need an availability window',
      });
    }
    if (v.type === 'daily_challenge' && !v.challengeDate) {
      ctx.addIssue({ code: 'custom', path: ['challengeDate'], message: 'Choose the day of the challenge' });
    }
    if (v.type !== 'daily_challenge' && v.challengeDate) {
      ctx.addIssue({ code: 'custom', path: ['challengeDate'], message: 'Only daily challenges have a day' });
    }
    if (v.topicId && !v.chapterId) {
      ctx.addIssue({ code: 'custom', path: ['chapterId'], message: 'Choose the chapter of the topic' });
    }
    if (v.chapterId && !v.subjectId) {
      ctx.addIssue({ code: 'custom', path: ['subjectId'], message: 'Choose the subject of the chapter' });
    }
  });
export type AssessmentInput = z.infer<typeof AssessmentInput>;

/** Random sections pick from the question bank at attempt time using these filters. */
export const QuestionPoolFilter = z.object({
  subjectId: z.uuid(),
  chapterId: z.uuid().nullable().optional(),
  topicId: z.uuid().nullable().optional(),
  difficulty: Difficulty.nullable().optional(),
  types: z.array(QuestionType).max(7).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  pyqOnly: z.boolean().optional(),
});
export type QuestionPoolFilter = z.infer<typeof QuestionPoolFilter>;

export const AssessmentSectionInput = z
  .object({
    title: LocalizedText.nullable().optional(),
    pickMode: z.enum(['fixed', 'random']),
    /** fixed: the chosen questions in order; per-question marks override the question's defaults. */
    questions: z
      .array(
        z.object({
          questionId: z.uuid(),
          marks: Marks.nullable().optional(),
          negativeMarks: Marks.nullable().optional(),
        }),
      )
      .max(500)
      .default([]),
    /** random: */
    filter: QuestionPoolFilter.nullable().optional(),
    questionCount: z.number().int().min(1).max(500).nullable().optional(),
    /** Section-wide marks (override question defaults when set). */
    marksPerQuestion: Marks.nullable().optional(),
    negativeMarksPerQuestion: Marks.nullable().optional(),
  })
  .superRefine((s, ctx) => {
    if (s.pickMode === 'fixed') {
      if (!s.questions.length)
        ctx.addIssue({ code: 'custom', path: ['questions'], message: 'Add at least one question' });
      const ids = s.questions.map((q) => q.questionId);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions'],
          message: 'A question is listed twice in this section',
        });
      }
    } else {
      if (!s.filter)
        ctx.addIssue({ code: 'custom', path: ['filter'], message: 'Choose where to pick questions from' });
      if (!s.questionCount)
        ctx.addIssue({ code: 'custom', path: ['questionCount'], message: 'How many questions?' });
      if (s.filter?.topicId && !s.filter.chapterId) {
        ctx.addIssue({
          code: 'custom',
          path: ['filter', 'chapterId'],
          message: 'Choose the chapter of the topic',
        });
      }
    }
  });
export type AssessmentSectionInput = z.infer<typeof AssessmentSectionInput>;

export const AssessmentStructureInput = z
  .object({ sections: z.array(AssessmentSectionInput).min(1).max(20) })
  .superRefine((v, ctx) => {
    const fixed = v.sections.flatMap((s) =>
      s.pickMode === 'fixed' ? s.questions.map((q) => q.questionId) : [],
    );
    if (new Set(fixed).size !== fixed.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['sections'],
        message: 'A question appears in more than one section',
      });
    }
    const total = v.sections.reduce(
      (n, s) => n + (s.pickMode === 'fixed' ? s.questions.length : (s.questionCount ?? 0)),
      0,
    );
    if (total > 500)
      ctx.addIssue({ code: 'custom', path: ['sections'], message: 'At most 500 questions per assessment' });
  });
export type AssessmentStructureInput = z.infer<typeof AssessmentStructureInput>;

export const AssessmentListQuery = CursorQuery.extend({
  cursor: z.uuid().optional(),
  q: z.string().trim().max(120).optional(),
  type: AssessmentType.optional(),
  status: PublishStatus.optional(),
  courseId: z.uuid().optional(),
});
export type AssessmentListQuery = z.infer<typeof AssessmentListQuery>;
