import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type GradeAnswerInput,
  type GradingQueueQuery,
  type LocalizedText,
  type QuestionContent,
} from '@tk/contracts';
import { countedAttempt, gradeSubjective, marksToCentimarks, resultsReleased } from '@tk/domain';
import { AppError, Errors } from '../../common/errors/app-error.js';
import type { Assessment, Attempt, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AssessmentsService } from '../assessments/assessments.service.js';
import { AuditService } from '../audit/audit.service.js';
import { splitQuestion } from '../content/practice-view.js';
import type { ContentActor } from '../content/scope.service.js';
import { planQuestions, type AttemptPlan } from './attempt-plan.js';
import { cm, retotalAttempt } from './attempt-totals.js';

const FINISHED = ['pending_grading', 'completed'] as const;

/**
 * Staff side of attempts (§10 part 2): the grading queue for written answers, results per assessment, one attempt
 * in full, and manual release of results. Staff scopes apply as for editing (only assigned courses/subjects).
 */
@Injectable()
export class AdminAttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assessments: AssessmentsService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── Grading queue ─────────────

  /** Written answers awaiting marks in instructor-graded assessments, oldest submission first. */
  async queue(query: GradingQueueQuery, actor: ContentActor) {
    const scoped = await this.assessments.scopeFilter(actor);
    const where: Prisma.AttemptAnswerWhereInput = {
      outcome: 'pending',
      attempt: {
        status: 'pending_grading',
        assessment: {
          subjectiveGrading: 'instructor',
          deletedAt: null,
          ...(query.assessmentId ? { id: query.assessmentId } : {}),
          AND: [scoped ?? {}],
        },
      },
    };
    const [total, rows, assessments] = await Promise.all([
      this.prisma.attemptAnswer.count({ where }),
      this.prisma.attemptAnswer.findMany({
        where,
        orderBy: [{ attempt: { submittedAt: 'asc' } }, { questionId: 'asc' }],
        take: query.limit,
        include: {
          questionVersion: { select: { content: true } },
          attempt: { include: { assessment: true, user: { select: { fullName: true } } } },
        },
      }),
      // Assessments with answers waiting, for the filter.
      this.prisma.assessment.findMany({
        where: {
          deletedAt: null,
          subjectiveGrading: 'instructor',
          AND: [scoped ?? {}],
          attempts: { some: { status: 'pending_grading' } },
        },
        select: { id: true, title: true },
      }),
    ]);
    return {
      total,
      assessments: assessments.map((a) => ({ id: a.id, title: a.title as LocalizedText })),
      data: rows.map((r) => {
        const planned = planQuestions(r.attempt.plan as unknown as AttemptPlan).find(
          (q) => q.questionId === r.questionId,
        );
        const { question, answer } = splitQuestion(r.questionVersion.content as QuestionContent);
        return {
          attemptId: r.attemptId,
          questionId: r.questionId,
          assessment: { id: r.attempt.assessment.id, title: r.attempt.assessment.title as LocalizedText },
          student: r.attempt.user.fullName,
          submittedAt: r.attempt.submittedAt?.toISOString() ?? null,
          marks: planned?.marks ?? 0,
          question,
          answer,
          response: r.response,
        };
      }),
    };
  }

  /** Marks one written answer (or corrects earlier marks); totals and pass/fail follow. */
  async grade(attemptId: string, questionId: string, input: GradeAnswerInput, actor: ContentActor) {
    const attempt = await this.attemptInScope(attemptId, actor);
    if (attempt.status === 'in_progress') {
      throw new AppError(409, ErrorCode.CONFLICT, 'This attempt is still in progress');
    }
    const row = await this.prisma.attemptAnswer.findUnique({
      where: { attemptId_questionId: { attemptId, questionId } },
      include: { questionVersion: { select: { content: true } } },
    });
    const planned = planQuestions(attempt.plan as unknown as AttemptPlan).find(
      (q) => q.questionId === questionId,
    );
    if (!row || !planned) throw Errors.notFound('Answer');
    if ((row.questionVersion.content as QuestionContent).type !== 'subjective') {
      throw Errors.validation([{ path: 'questionId', message: 'Only written answers are marked by staff' }]);
    }
    if (row.outcome === 'skipped') {
      throw Errors.validation([{ path: 'questionId', message: 'The student did not answer this question' }]);
    }
    const awarded = marksToCentimarks(input.awarded);
    if (awarded > planned.marks) {
      throw Errors.validation([{ path: 'awarded', message: `At most ${planned.marks / 100} marks` }]);
    }
    const score = gradeSubjective(awarded, { marks: planned.marks, negativeMarks: 0 });
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.attemptAnswer.update({
        where: { attemptId_questionId: { attemptId, questionId } },
        data: {
          outcome: score.outcome,
          awarded: score.awarded,
          gradedById: actor.userId,
          gradedAt: now,
          graderComment: input.comment?.trim() || null,
        },
      });
      const after = await retotalAttempt(tx, attemptId, attempt.assessment);
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'attempt.grade',
          entityType: 'attempt',
          entityId: attemptId,
          changes: {
            questionId,
            before: { outcome: row.outcome, awarded: row.awarded },
            after: { outcome: score.outcome, awarded: score.awarded },
            attemptStatus: after.status,
          },
          client: actor.client,
        },
        tx,
      );
    });
    return this.attempt(attemptId, actor);
  }

  // ───────────── Results ─────────────

  /** Attempts of one assessment with the numbers that matter (statistics use each student's official attempt). */
  async results(assessmentId: string, actor: ContentActor, cursor: string | undefined, limit: number) {
    const a = await this.assessmentInScope(assessmentId, actor);
    const all = await this.prisma.attempt.findMany({
      where: { assessmentId, status: { not: 'voided' } },
      select: {
        id: true,
        userId: true,
        attemptNo: true,
        status: true,
        score: true,
        timeTakenSeconds: true,
        passed: true,
      },
    });
    const byStudent = new Map<string, typeof all>();
    for (const t of all) byStudent.set(t.userId, [...(byStudent.get(t.userId) ?? []), t]);
    const official = new Map<string, (typeof all)[number]>();
    for (const [userId, attempts] of byStudent) {
      const finished = attempts.filter((t) => (FINISHED as readonly string[]).includes(t.status));
      const pick = countedAttempt(
        finished.map((t) => ({
          id: t.id,
          attemptNo: t.attemptNo,
          score: t.status === 'completed' ? t.score : null,
          timeTakenSeconds: t.timeTakenSeconds ?? 0,
        })),
        a.countedAttempt,
      );
      const chosen = pick && finished.find((t) => t.id === pick.id);
      if (chosen) official.set(userId, chosen);
    }
    const scored = [...official.values()].filter((t) => t.status === 'completed' && t.score !== null);
    const withPass = scored.filter((t) => t.passed !== null);

    const rows = await this.prisma.attempt.findMany({
      where: { assessmentId, status: { not: 'voided' }, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { id: 'desc' },
      take: limit + 1,
      include: { user: { select: { id: true, fullName: true } } },
    });
    const page = rows.slice(0, limit);
    const officialIds = new Set([...official.values()].map((t) => t.id));
    return {
      assessment: {
        id: a.id,
        title: a.title as LocalizedText,
        resultRelease: a.resultRelease,
        resultsReleasedAt: a.resultsReleasedAt?.toISOString() ?? null,
        released: resultsReleased(a, new Date()),
        subjectiveGrading: a.subjectiveGrading,
        passMarks: cm(a.passMarks),
      },
      stats: {
        attempts: all.length,
        students: byStudent.size,
        inProgress: all.filter((t) => t.status === 'in_progress').length,
        pendingGrading: all.filter((t) => t.status === 'pending_grading').length,
        averageScore: scored.length
          ? Math.round(scored.reduce((s, t) => s + (t.score ?? 0), 0) / scored.length)
          : null,
        passed: withPass.filter((t) => t.passed).length,
        withPassMark: withPass.length,
      },
      data: page.map((t) => ({
        ...attemptRow(t),
        student: { id: t.user.id, fullName: t.user.fullName },
        official: officialIds.has(t.id),
      })),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  /** One attempt in full: every question with the student's answer, the key, outcome and marks. */
  async attempt(attemptId: string, actor: ContentActor) {
    const attempt = await this.attemptInScope(attemptId, actor);
    const rows = await this.prisma.attemptAnswer.findMany({
      where: { attemptId },
      include: {
        questionVersion: { select: { content: true } },
        gradedBy: { select: { fullName: true } },
      },
    });
    const byQuestion = new Map(rows.map((r) => [r.questionId, r]));
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: attempt.userId } });
    let number = 0;
    return {
      ...attemptRow(attempt),
      assessment: {
        id: attempt.assessment.id,
        title: attempt.assessment.title as LocalizedText,
        subjectiveGrading: attempt.assessment.subjectiveGrading,
      },
      student: { id: user.id, fullName: user.fullName },
      questions: planQuestions(attempt.plan as unknown as AttemptPlan).flatMap((q) => {
        const r = byQuestion.get(q.questionId);
        if (!r) return [];
        number += 1;
        const { question, answer } = splitQuestion(r.questionVersion.content as QuestionContent);
        return [
          {
            questionId: q.questionId,
            number,
            marks: q.marks,
            negativeMarks: q.negativeMarks,
            question,
            answer,
            response: r.response,
            markedForReview: r.markedForReview,
            outcome: r.outcome,
            awarded: r.awarded,
            gradedBy: r.gradedBy?.fullName ?? null,
            gradedAt: r.gradedAt?.toISOString() ?? null,
            graderComment: r.graderComment,
          },
        ];
      }),
    };
  }

  /** Manual release (result release "when staff release them"). Releasing twice changes nothing. */
  async release(assessmentId: string, actor: ContentActor) {
    const a = await this.assessmentInScope(assessmentId, actor);
    if (a.resultRelease !== 'manual') {
      throw new AppError(409, ErrorCode.CONFLICT, 'This assessment releases its results automatically');
    }
    if (!a.resultsReleasedAt) {
      const now = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.assessment.update({ where: { id: a.id }, data: { resultsReleasedAt: now } });
        await this.audit.record(
          {
            actorUserId: actor.userId,
            action: 'assessment.results_release',
            entityType: 'assessment',
            entityId: a.id,
            changes: {
              pendingGrading: await tx.attempt.count({
                where: { assessmentId: a.id, status: 'pending_grading' },
              }),
            },
            client: actor.client,
          },
          tx,
        );
      });
    }
    return this.results(assessmentId, actor, undefined, 20);
  }

  // ───────────── helpers ─────────────

  private async assessmentInScope(id: string, actor: ContentActor): Promise<Assessment> {
    const a = await this.prisma.assessment.findFirst({ where: { id, deletedAt: null } });
    if (!a) throw Errors.notFound('Assessment');
    await this.assessments.assertScope(actor, a);
    return a;
  }

  private async attemptInScope(
    id: string,
    actor: ContentActor,
  ): Promise<Attempt & { assessment: Assessment }> {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id, status: { not: 'voided' } },
      include: { assessment: true },
    });
    if (!attempt) throw Errors.notFound('Attempt');
    await this.assessments.assertScope(actor, attempt.assessment);
    return attempt;
  }
}

function attemptRow(t: Attempt) {
  return {
    id: t.id,
    attemptNo: t.attemptNo,
    status: t.status,
    autoSubmitted: t.autoSubmitted,
    startedAt: t.startedAt.toISOString(),
    submittedAt: t.submittedAt?.toISOString() ?? null,
    score: t.score,
    maxScore: t.maxScore,
    pending: t.pendingCount,
    passed: t.passed,
    timeTakenSeconds: t.timeTakenSeconds,
  };
}
