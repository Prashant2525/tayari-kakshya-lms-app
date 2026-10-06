import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type AnswerResponseInput,
  type LocalizedText,
  type QuestionContent,
  type SaveAnswersInput,
  type ScoringRulesInput,
  type SelfGradeInput,
  type StudentAssessmentQuery,
} from '@tk/contracts';
import {
  attemptDeadline,
  countedAttempt,
  gradeSubjective,
  marksToCentimarks,
  releaseDate,
  resultsReleased,
  scoreQuestion,
  windowState,
  type AnswerKey,
  type AnswerResponse,
  type MarkScheme,
} from '@tk/domain';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { Prisma, type Assessment, type Attempt } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { poolWhere } from '../assessments/assessments.service.js';
import { CatalogService, type Viewer } from '../content/catalog.service.js';
import {
  activeEntitlementWhere,
  EntitlementsService,
  premiumSourceWhere,
} from '../content/entitlements.service.js';
import { mediaIdsIn, splitQuestion } from '../content/practice-view.js';
import { isLive, liveWhere } from '../content/publishing.js';
import { MediaService } from '../media/media.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { cm, retotalAttempt } from './attempt-totals.js';
import { EngagementService, isoDay, nepalDay } from './engagement.service.js';
import {
  optionOrderFor,
  ordered,
  planQuestions,
  shuffled,
  type AttemptPlan,
  type PlannedQuestion,
  type PlannedSection,
} from './attempt-plan.js';

type AssessmentWithSections = Prisma.AssessmentGetPayload<{
  include: {
    sections: { include: { questions: { include: { question: true } } } };
  };
}>;

const notAvailable = (reason: 'not_open' | 'closed' | 'no_attempts_left' | 'not_ready', message: string) =>
  new AppError(409, ErrorCode.ASSESSMENT_NOT_AVAILABLE, message, { reason });
const closed = () =>
  new AppError(409, ErrorCode.ATTEMPT_CLOSED, 'This attempt has ended; its answers can no longer change');
const FINISHED = ['pending_grading', 'completed'] as const;

/**
 * Students taking assessments (§10, D-021, D-044, D-048). Every rule is enforced here with the server clock: access,
 * availability window, attempt limit, deadline (+ grace from `assessments.timing`), scoring and result release. The
 * app only displays what this returns; answer keys never reach it before results are released.
 */
@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly entitlements: EntitlementsService,
    private readonly media: MediaService,
    private readonly settings: SettingsService,
    private readonly engagement: EngagementService,
  ) {}

  // ───────────── Lists and details ─────────────

  async list(query: StudentAssessmentQuery, viewer: Viewer) {
    const now = new Date();
    const scope = await this.listScope(query, viewer);
    const assessments = await this.prisma.assessment.findMany({
      // AND: both the live filter and the scope use OR clauses, which must not overwrite each other.
      where: { AND: [liveWhere(now), scope], type: query.type ?? { not: 'daily_challenge' } },
      include: { sections: { include: { questions: { include: { question: true } } } } },
      orderBy: [{ opensAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    const access = await this.accessContext(viewer);
    const attempts = await this.prisma.attempt.findMany({
      where: {
        userId: viewer.userId,
        assessmentId: { in: assessments.map((a) => a.id) },
        status: { not: 'voided' },
      },
      orderBy: { attemptNo: 'asc' },
    });
    return {
      data: await Promise.all(
        assessments.map(async (a) =>
          this.summary(
            a,
            await this.canTake(a, viewer, access),
            attempts.filter((t) => t.assessmentId === a.id),
            now,
          ),
        ),
      ),
    };
  }

  async detail(id: string, viewer: Viewer) {
    const now = new Date();
    const a = await this.liveAssessment(id);
    const [allowed, attempts] = await Promise.all([
      this.canTake(a, viewer, await this.accessContext(viewer)),
      this.prisma.attempt.findMany({
        where: { userId: viewer.userId, assessmentId: id, status: { not: 'voided' } },
        orderBy: { attemptNo: 'asc' },
      }),
    ]);
    const summary = this.summary(a, allowed, attempts, now);
    const released = resultsReleased(a, now);
    const counted = this.counted(a, attempts);
    const scoring = a.scoring as ScoringRulesInput;
    return {
      ...summary,
      instructions: a.instructions ?? null,
      rules: {
        negativeMarking: scoring.negativeMarking,
        passMarks: cm(a.passMarks),
        resultRelease: a.resultRelease,
        releaseAt: releaseDate(a)?.toISOString() ?? null,
        showExplanations: a.showExplanations,
        subjectiveGrading: a.subjectiveGrading,
        countedAttempt: a.countedAttempt,
        lateStart: a.lateStart,
      },
      attempts: attempts.map((t) => this.attemptSummary(t, released, counted?.id === t.id)),
    };
  }

  // ───────────── Taking an attempt ─────────────

  /** Starts an attempt, or returns the unfinished one (a second tap, a retry or another device resume it). */
  async start(id: string, viewer: Viewer) {
    const now = new Date();
    const a = await this.liveAssessment(id);
    await this.catalog.assertVerifiedForLearning(viewer);
    if (!(await this.canTake(a, viewer, await this.accessContext(viewer)))) {
      throw new AppError(403, ErrorCode.CONTENT_LOCKED, 'This assessment needs course access');
    }
    const open = await this.prisma.attempt.findFirst({
      where: { assessmentId: id, userId: viewer.userId, status: 'in_progress' },
    });
    if (open) {
      if (!(await this.expired(open, now))) return this.view(open.id, viewer);
      await this.finalize(open.id, now);
    }
    const state = windowState(a, now);
    if (state === 'upcoming') throw notAvailable('not_open', 'This assessment has not opened yet');
    if (state === 'closed') throw notAvailable('closed', 'This assessment has closed');
    // Daily challenges (D-049): open on their Nepal day; afterwards only as practice, when the CMS allows it.
    let practice = false;
    if (a.type === 'daily_challenge' && a.challengeDate) {
      const day = isoDay(a.challengeDate);
      const today = nepalDay(now);
      if (day > today) throw notAvailable('not_open', 'This challenge opens on its day');
      if (day < today) {
        if (!(await this.settings.get('dailyChallenge.rules')).pastAsPractice) {
          throw notAvailable('closed', 'This challenge has closed');
        }
        practice = true;
      }
    }
    const used = await this.prisma.attempt.findMany({
      where: { assessmentId: id, userId: viewer.userId },
      select: { attemptNo: true, status: true },
    });
    const counted = used.filter((t) => t.status !== 'voided').length;
    if (a.maxAttempts !== null && counted >= a.maxAttempts) {
      throw notAvailable('no_attempts_left', 'You have used all attempts for this assessment');
    }

    const plan = await this.buildPlan(a);
    const questions = planQuestions(plan);
    if (!questions.length) throw notAvailable('not_ready', 'This assessment has no questions available');
    const attemptNo = Math.max(0, ...used.map((t) => t.attemptNo)) + 1;
    try {
      const attempt = await this.prisma.$transaction(async (tx) => {
        const created = await tx.attempt.create({
          data: {
            assessmentId: id,
            userId: viewer.userId,
            attemptNo,
            practice,
            startedAt: now,
            deadlineAt: attemptDeadline(a, now),
            plan: plan as unknown as Prisma.InputJsonValue,
            maxScore: questions.reduce((sum, q) => sum + q.marks, 0),
          },
        });
        await tx.attemptAnswer.createMany({
          data: questions.map((q) => ({
            attemptId: created.id,
            questionId: q.questionId,
            questionVersionId: q.versionId,
          })),
        });
        return created;
      });
      return this.view(attempt.id, viewer);
    } catch (err) {
      // Two starts at once: the database allows one unfinished attempt (and one number); return the winner.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.prisma.attempt.findFirst({
          where: { assessmentId: id, userId: viewer.userId, status: 'in_progress' },
        });
        if (winner) return this.view(winner.id, viewer);
      }
      throw err;
    }
  }

  /** The questions (never their answers), saved responses and the clock. Finishes an attempt whose time is up. */
  async view(attemptId: string, viewer: Viewer) {
    const now = new Date();
    let attempt = await this.ownAttempt(attemptId, viewer);
    if (attempt.status === 'in_progress' && (await this.expired(attempt, now))) {
      await this.finalize(attempt.id, now);
      attempt = await this.ownAttempt(attemptId, viewer);
    }
    const a = await this.prisma.assessment.findUniqueOrThrow({ where: { id: attempt.assessmentId } });
    const { sections, media } = await this.questionsOf(attempt, false);
    return {
      id: attempt.id,
      assessment: { id: a.id, type: a.type, title: a.title as LocalizedText },
      attemptNo: attempt.attemptNo,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      deadlineAt: attempt.deadlineAt?.toISOString() ?? null,
      serverNow: now.toISOString(),
      sections,
      media,
    };
  }

  /** Autosave. Answers arriving up to the grace period after the deadline still count; later ones finish it. */
  async saveAnswers(attemptId: string, input: SaveAnswersInput, viewer: Viewer) {
    const now = new Date();
    const attempt = await this.ownAttempt(attemptId, viewer);
    if (attempt.status !== 'in_progress') throw closed();
    if (await this.expired(attempt, now)) {
      await this.finalize(attempt.id, now);
      throw closed();
    }
    const planned = new Map(
      planQuestions(attempt.plan as unknown as AttemptPlan).map((q) => [q.questionId, q]),
    );
    const problems: Array<{ path: string; message: string }> = [];
    input.answers.forEach((ans, i) => {
      const q = planned.get(ans.questionId);
      if (!q) problems.push({ path: `answers.${i}.questionId`, message: 'Not a question of this attempt' });
      else if (ans.response && ans.response.type !== q.type)
        problems.push({ path: `answers.${i}.response`, message: `Expected a ${q.type} answer` });
    });
    if (problems.length) throw Errors.validation(problems);

    await this.prisma.$transaction(async (tx) => {
      // Re-check under the row lock: a concurrent submit must not be overwritten.
      const live = await tx.attempt.updateMany({
        where: { id: attempt.id, status: 'in_progress' },
        data: { updatedAt: now },
      });
      if (!live.count) throw closed();
      const madeAt = input.clientSavedAt ? new Date(input.clientSavedAt) : null;
      for (const ans of input.answers) {
        const response = answered(ans.response) ? ans.response : null;
        // A batch made before the one that set this answer arrived late (retried after a lost connection): skip it.
        await tx.attemptAnswer.updateMany({
          where: {
            attemptId: attempt.id,
            questionId: ans.questionId,
            ...(madeAt ? { OR: [{ clientSavedAt: null }, { clientSavedAt: { lte: madeAt } }] } : {}),
          },
          data: {
            response: response ? (response as Prisma.InputJsonValue) : Prisma.DbNull,
            markedForReview: ans.markedForReview,
            answeredAt: response ? now : null,
            clientSavedAt: madeAt,
          },
        });
      }
    });
    return { savedAt: now.toISOString(), serverNow: now.toISOString() };
  }

  /** Submits (idempotent: a repeated submit returns the same result). */
  async submit(attemptId: string, viewer: Viewer) {
    const attempt = await this.ownAttempt(attemptId, viewer);
    if (attempt.status === 'in_progress') await this.finalize(attempt.id, new Date());
    return this.result(attemptId, viewer);
  }

  // ───────────── Results ─────────────

  async result(attemptId: string, viewer: Viewer) {
    const now = new Date();
    let attempt = await this.ownAttempt(attemptId, viewer);
    if (attempt.status === 'in_progress' && (await this.expired(attempt, now))) {
      await this.finalize(attempt.id, now);
      attempt = await this.ownAttempt(attemptId, viewer);
    }
    const a = await this.prisma.assessment.findUniqueOrThrow({ where: { id: attempt.assessmentId } });
    const released = attempt.status !== 'in_progress' && resultsReleased(a, now);
    const siblings = await this.prisma.attempt.findMany({
      where: { userId: viewer.userId, assessmentId: a.id, status: { not: 'voided' } },
    });
    const base = {
      id: attempt.id,
      assessment: {
        id: a.id,
        type: a.type,
        title: a.title as LocalizedText,
        passMarks: cm(a.passMarks),
        showExplanations: a.showExplanations,
        subjectiveGrading: a.subjectiveGrading,
        leaderboardEnabled: a.leaderboardEnabled,
      },
      attemptNo: attempt.attemptNo,
      practice: attempt.practice,
      status: attempt.status,
      autoSubmitted: attempt.autoSubmitted,
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      timeTakenSeconds: attempt.timeTakenSeconds,
      counted: this.counted(a, siblings)?.id === attempt.id,
      released,
      releaseAt: releaseDate(a)?.toISOString() ?? null,
    };
    if (!released)
      return {
        ...base,
        summary: null,
        sections: [],
        questions: [],
        media: {},
        canSelfGrade: false,
        rank: null,
      };

    const { sections, questions, media } = await this.solutionsOf(attempt, a);
    return {
      ...base,
      summary: {
        score: attempt.score,
        maxScore: attempt.maxScore,
        correct: attempt.correctCount,
        partial: attempt.partialCount,
        wrong: attempt.wrongCount,
        skipped: attempt.skippedCount,
        pending: attempt.pendingCount,
        passed: attempt.passed,
      },
      sections,
      questions,
      media,
      canSelfGrade: attempt.status === 'pending_grading' && a.subjectiveGrading === 'self',
      rank: await this.engagement.rankOf(a, attempt.id, now),
    };
  }

  // ───────────── Daily challenge and leaderboards (§10 part 3a, D-049) ─────────────

  /** Today's challenge (Nepal day), the student's state on it, and their streak. */
  async dailyToday(viewer: Viewer) {
    const now = new Date();
    const today = nepalDay(now);
    const [a, streak] = await Promise.all([
      this.prisma.assessment.findFirst({
        where: { ...liveWhere(now), type: 'daily_challenge', challengeDate: new Date(`${today}T00:00:00Z`) },
        include: { sections: { include: { questions: { include: { question: true } } } } },
      }),
      this.engagement.streak(viewer.userId, now),
    ]);
    if (!a) return { today, challenge: null, streak };
    const [allowed, attempts] = await Promise.all([
      this.canTake(a, viewer, await this.accessContext(viewer)),
      this.prisma.attempt.findMany({
        where: { userId: viewer.userId, assessmentId: a.id, status: { not: 'voided' } },
        orderBy: { attemptNo: 'asc' },
      }),
    ]);
    return { today, challenge: this.summary(a, allowed, attempts, now), streak };
  }

  /** Earlier challenges, newest first (open as practice when the CMS allows it). */
  async dailyPast(viewer: Viewer, cursor: string | undefined, limit: number) {
    const now = new Date();
    const today = new Date(`${nepalDay(now)}T00:00:00Z`);
    const rows = await this.prisma.assessment.findMany({
      where: { ...liveWhere(now), type: 'daily_challenge', challengeDate: { lt: today } },
      include: { sections: { include: { questions: { include: { question: true } } } } },
      orderBy: [{ challengeDate: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const [ctx, attempts, rules] = await Promise.all([
      this.accessContext(viewer),
      this.prisma.attempt.findMany({
        where: {
          userId: viewer.userId,
          assessmentId: { in: page.map((a) => a.id) },
          status: { not: 'voided' },
        },
        orderBy: { attemptNo: 'asc' },
      }),
      this.settings.get('dailyChallenge.rules'),
    ]);
    return {
      pastAsPractice: rules.pastAsPractice,
      data: await Promise.all(
        page.map(async (a) =>
          this.summary(
            a,
            await this.canTake(a, viewer, ctx),
            attempts.filter((t) => t.assessmentId === a.id),
            now,
          ),
        ),
      ),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async leaderboard(id: string, viewer: Viewer) {
    const a = await this.liveAssessment(id);
    const board = await this.engagement.leaderboard(a, viewer.userId);
    if (!board) throw Errors.notFound('Leaderboard');
    return { assessment: { id: a.id, type: a.type, title: a.title as LocalizedText }, ...board };
  }

  async streak(viewer: Viewer) {
    return this.engagement.streak(viewer.userId);
  }

  /** Self-evaluation of written answers against the model answer (subjective grading `self`, after release). */
  async selfGrade(attemptId: string, input: SelfGradeInput, viewer: Viewer) {
    const now = new Date();
    const attempt = await this.ownAttempt(attemptId, viewer);
    const a = await this.prisma.assessment.findUniqueOrThrow({ where: { id: attempt.assessmentId } });
    if (a.subjectiveGrading !== 'self' || attempt.status !== 'pending_grading' || !resultsReleased(a, now)) {
      throw new AppError(409, ErrorCode.CONFLICT, 'These answers cannot be self-graded now');
    }
    const planned = new Map(
      planQuestions(attempt.plan as unknown as AttemptPlan).map((q) => [q.questionId, q]),
    );
    const rows = await this.prisma.attemptAnswer.findMany({ where: { attemptId } });
    const pending = new Map(rows.filter((r) => r.outcome === 'pending').map((r) => [r.questionId, r]));
    const problems: Array<{ path: string; message: string }> = [];
    const scores = input.grades.map((g, i) => {
      const q = planned.get(g.questionId);
      if (!q || !pending.has(g.questionId)) {
        problems.push({ path: `grades.${i}.questionId`, message: 'Not a written answer awaiting marks' });
        return null;
      }
      const awarded = marksToCentimarks(g.awarded);
      if (awarded > q.marks) {
        problems.push({ path: `grades.${i}.awarded`, message: `At most ${q.marks / 100} marks` });
        return null;
      }
      return {
        questionId: g.questionId,
        score: gradeSubjective(awarded, { marks: q.marks, negativeMarks: 0 }),
      };
    });
    if (problems.length) throw Errors.validation(problems);
    await this.prisma.$transaction(async (tx) => {
      for (const s of scores) {
        if (!s) continue;
        await tx.attemptAnswer.update({
          where: { attemptId_questionId: { attemptId, questionId: s.questionId } },
          data: { outcome: s.score.outcome, awarded: s.score.awarded, gradedAt: now },
        });
      }
      await retotalAttempt(tx, attempt.id, a);
    });
    return this.result(attemptId, viewer);
  }

  async history(viewer: Viewer, cursor: string | undefined, limit: number) {
    const now = new Date();
    const rows = await this.prisma.attempt.findMany({
      where: { userId: viewer.userId, status: { not: 'voided' } },
      include: { assessment: true },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    return {
      data: page.map((t) => ({
        ...this.attemptSummary(t, resultsReleased(t.assessment, now), false),
        assessment: {
          id: t.assessment.id,
          type: t.assessment.type,
          title: t.assessment.title as LocalizedText,
        },
      })),
      nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  /** Worker: finishes attempts whose time (and grace) ran out while the student was away. */
  async finishExpired(now = new Date()): Promise<number> {
    const { graceSeconds } = await this.settings.get('assessments.timing');
    const due = await this.prisma.attempt.findMany({
      where: { status: 'in_progress', deadlineAt: { lt: new Date(now.getTime() - graceSeconds * 1000) } },
      select: { id: true },
      take: 500,
    });
    for (const { id } of due) await this.finalize(id, now);
    return due.length;
  }

  // ───────────── Scoring ─────────────

  /** Scores and closes an in-progress attempt exactly once (a concurrent finish waits, then does nothing). */
  private async finalize(attemptId: string, now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.attempt.findUniqueOrThrow({ where: { id: attemptId } });
      const a = await tx.assessment.findUniqueOrThrow({ where: { id: attempt.assessmentId } });
      const timeUp = attempt.deadlineAt !== null && now > attempt.deadlineAt;
      const submittedAt = timeUp ? (attempt.deadlineAt as Date) : now;
      const claimed = await tx.attempt.updateMany({
        where: { id: attemptId, status: 'in_progress' },
        data: { status: 'pending_grading', submittedAt, autoSubmitted: timeUp },
      });
      if (!claimed.count) return;

      const planned = planQuestions(attempt.plan as unknown as AttemptPlan);
      const rows = await tx.attemptAnswer.findMany({
        where: { attemptId },
        include: { questionVersion: { select: { content: true } } },
      });
      const byQuestion = new Map(rows.map((r) => [r.questionId, r]));
      const rules = a.scoring as ScoringRulesInput;
      for (const q of planned) {
        const row = byQuestion.get(q.questionId);
        if (!row) continue;
        const score = scoreOne(row.questionVersion.content as QuestionContent, row.response, q, rules);
        await tx.attemptAnswer.update({
          where: { attemptId_questionId: { attemptId, questionId: q.questionId } },
          data: { outcome: score.outcome, awarded: score.outcome === 'pending' ? null : score.awarded },
        });
      }
      await tx.attempt.update({
        where: { id: attemptId },
        data: {
          timeTakenSeconds: Math.max(
            0,
            Math.round((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000),
          ),
        },
      });
      await retotalAttempt(tx, attemptId, a);
      // A daily challenge submitted on its day keeps the streak going (D-049); practice never does.
      if (a.type === 'daily_challenge' && a.challengeDate && !attempt.practice) {
        await this.engagement.recordChallengeDay(tx, attempt.userId, isoDay(a.challengeDate));
      }
    });
  }

  // ───────────── Plans and views ─────────────

  private async buildPlan(a: AssessmentWithSections): Promise<AttemptPlan> {
    const negative = (a.scoring as ScoringRulesInput).negativeMarking;
    const used = new Set<string>();
    const sections: PlannedSection[] = [];
    for (const s of [...a.sections].sort((x, y) => x.sortOrder - y.sortOrder)) {
      type Chosen = {
        question: Prisma.QuestionGetPayload<object>;
        marks: Prisma.Decimal | null;
        negative: Prisma.Decimal | null;
      };
      let picks: Chosen[];
      if (s.pickMode === 'fixed') {
        picks = [...s.questions]
          .sort((x, y) => x.sortOrder - y.sortOrder)
          .filter(
            (aq) =>
              aq.question.status === 'published' && !aq.question.deletedAt && aq.question.currentVersionId,
          )
          .map((aq) => ({ question: aq.question, marks: aq.marks, negative: aq.negativeMarks }));
        if (a.shuffleQuestions) picks = shuffled(picks);
      } else {
        const pool = await this.prisma.question.findMany({
          where: {
            ...poolWhere(s.filter as never),
            currentVersionId: { not: null },
            id: { notIn: [...used] },
          },
        });
        picks = shuffled(pool)
          .slice(0, s.questionCount ?? 0)
          .map((question) => ({ question, marks: null, negative: null }));
      }
      const versions = await this.prisma.questionVersion.findMany({
        where: { id: { in: picks.map((p) => p.question.currentVersionId as string) } },
      });
      const contentOf = new Map(versions.map((v) => [v.id, v.content as QuestionContent]));
      const questions: PlannedQuestion[] = [];
      for (const p of picks) {
        if (used.has(p.question.id)) continue;
        used.add(p.question.id);
        const versionId = p.question.currentVersionId as string;
        const content = contentOf.get(versionId);
        if (!content) continue;
        questions.push({
          questionId: p.question.id,
          versionId,
          type: content.type,
          marks: cm(p.marks) ?? cm(s.marksPerQuestion) ?? (cm(p.question.defaultMarks) as number),
          negativeMarks: negative
            ? (cm(p.negative) ??
              cm(s.negativeMarksPerQuestion) ??
              (cm(p.question.defaultNegativeMarks) as number))
            : 0,
          optionOrder: optionOrderFor(content, a.shuffleOptions),
        });
      }
      if (questions.length) {
        sections.push({ sectionId: s.id, title: (s.title as LocalizedText | null) ?? null, questions });
      }
    }
    return { sections };
  }

  /** The planned questions as the student sees them; with answers only for result screens. */
  private async questionsOf(attempt: Attempt, withSolutions: boolean) {
    const plan = attempt.plan as unknown as AttemptPlan;
    const rows = await this.prisma.attemptAnswer.findMany({
      where: { attemptId: attempt.id },
      include: {
        questionVersion: { select: { content: true } },
        question: { include: { group: true } },
      },
    });
    const byQuestion = new Map(rows.map((r) => [r.questionId, r]));
    let number = 0;
    const sections = plan.sections.map((s) => ({
      title: s.title,
      questions: s.questions.flatMap((q) => {
        const row = byQuestion.get(q.questionId);
        if (!row) return [];
        number += 1;
        const { question, answer } = splitQuestion(row.questionVersion.content as QuestionContent);
        const group = row.question.group;
        return [
          {
            questionId: q.questionId,
            number,
            marks: q.marks,
            negativeMarks: q.negativeMarks,
            question: withOptionOrder(question, q.optionOrder),
            passage:
              group && !group.deletedAt
                ? {
                    id: group.id,
                    title: (group.title as LocalizedText | null) ?? null,
                    content: group.passage,
                  }
                : null,
            response: (row.response as AnswerResponseInput | null) ?? null,
            markedForReview: row.markedForReview,
            ...(withSolutions
              ? { answer, outcome: row.outcome, awarded: row.awarded, graderComment: row.graderComment }
              : {}),
          },
        ];
      }),
    }));
    const media = await this.media.publicImageUrls([...mediaIdsIn(sections)]);
    return { sections, media };
  }

  private async solutionsOf(attempt: Attempt, a: Assessment) {
    const { sections, media } = await this.questionsOf(attempt, true);
    const breakdown = sections.map((s) => {
      const qs = s.questions;
      return {
        title: s.title,
        score: qs.reduce((sum, q) => sum + (q.awarded ?? 0), 0),
        maxScore: qs.reduce((sum, q) => sum + q.marks, 0),
        correct: qs.filter((q) => q.outcome === 'correct').length,
        partial: qs.filter((q) => q.outcome === 'partial').length,
        wrong: qs.filter((q) => q.outcome === 'wrong').length,
        skipped: qs.filter((q) => q.outcome === 'skipped').length,
        pending: qs.filter((q) => q.outcome === 'pending').length,
      };
    });
    const questions = sections.flatMap((s) =>
      s.questions.map((q) => ({
        ...q,
        // The correct answer is part of a released result; the explanation follows the assessment setting.
        answer: q.answer
          ? { ...q.answer, explanation: a.showExplanations ? q.answer.explanation : null }
          : null,
      })),
    );
    return { sections: breakdown, questions, media };
  }

  // ───────────── Access ─────────────

  /** Courses whose Premium tests the student may take (D-053: not through a free enrolment). */
  private async accessContext(viewer: Viewer) {
    return { courses: await this.entitlements.premiumCourseIds(viewer.userId) };
  }

  /** D-048: free for everyone; Premium per the assessment's rule. */
  private async canTake(a: Assessment, viewer: Viewer, ctx: { courses: Set<string> }): Promise<boolean> {
    if (a.accessLevel === 'free') return true;
    if (a.premiumAccess === 'plans_only') return false;
    if (a.premiumAccess === 'any_course') return ctx.courses.size > 0;
    if (a.courseId) return ctx.courses.has(a.courseId);
    if (a.subjectId) return this.entitlements.hasSubjectAccess(viewer.userId, a.subjectId);
    if (a.examNodeId) {
      const nodes = await this.withDescendants([a.examNodeId]);
      const linked = await this.prisma.courseExamNode.count({
        where: {
          examNodeId: { in: [...nodes] },
          course: {
            deletedAt: null,
            entitlements: {
              some: { userId: viewer.userId, ...activeEntitlementWhere(), ...premiumSourceWhere },
            },
          },
        },
      });
      return linked > 0;
    }
    return false;
  }

  /** Where the list looks: a course (and optionally one of its subjects), or the student's exams and courses. */
  private async listScope(
    query: StudentAssessmentQuery,
    viewer: Viewer,
  ): Promise<Prisma.AssessmentWhereInput> {
    if (query.courseId) {
      const course = await this.prisma.course.findFirst({
        where: { id: query.courseId, deletedAt: null },
        include: { subjects: { select: { subjectId: true } } },
      });
      const entitled = await this.entitlements.activeCourseIds(viewer.userId);
      if (!course || (!isLive(course) && !entitled.has(course.id))) throw Errors.notFound('Course');
      const subjectIds = course.subjects.map((s) => s.subjectId);
      if (query.subjectId) {
        if (!subjectIds.includes(query.subjectId)) throw Errors.notFound('Subject');
        return { subjectId: query.subjectId, OR: [{ courseId: course.id }, { courseId: null }] };
      }
      return { OR: [{ courseId: course.id }, { courseId: null, subjectId: { in: subjectIds } }] };
    }
    const [targets, entitled] = await Promise.all([
      this.prisma.userTargetPost.findMany({ where: { userId: viewer.userId }, select: { examNodeId: true } }),
      this.entitlements.activeCourseIds(viewer.userId),
    ]);
    const nodes = await this.withAncestors(targets.map((t) => t.examNodeId));
    return {
      OR: [
        { courseId: null, subjectId: null, examNodeId: { in: [...nodes] } },
        { courseId: { in: [...entitled] }, subjectId: null },
      ],
    };
  }

  private async withDescendants(ids: string[]): Promise<Set<string>> {
    const all = new Set(ids);
    let frontier = ids;
    for (let depth = 0; frontier.length && depth < 10; depth++) {
      const children = await this.prisma.examNode.findMany({
        where: { parentId: { in: frontier }, deletedAt: null },
        select: { id: true },
      });
      frontier = children.map((c) => c.id).filter((id) => !all.has(id));
      frontier.forEach((id) => all.add(id));
    }
    return all;
  }

  private async withAncestors(ids: string[]): Promise<Set<string>> {
    const all = new Set(ids);
    let frontier = ids;
    for (let depth = 0; frontier.length && depth < 10; depth++) {
      const nodes = await this.prisma.examNode.findMany({
        where: { id: { in: frontier } },
        select: { parentId: true },
      });
      frontier = nodes
        .map((n) => n.parentId)
        .filter((id): id is string => Boolean(id) && !all.has(id as string));
      frontier.forEach((id) => all.add(id));
    }
    return all;
  }

  // ───────────── helpers ─────────────

  private async liveAssessment(id: string): Promise<AssessmentWithSections> {
    const a = await this.prisma.assessment.findFirst({
      where: { id, ...liveWhere() },
      include: { sections: { include: { questions: { include: { question: true } } } } },
    });
    if (!a) throw Errors.notFound('Assessment');
    return a;
  }

  private async ownAttempt(id: string, viewer: Viewer): Promise<Attempt> {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id, userId: viewer.userId, status: { not: 'voided' } },
    });
    if (!attempt) throw Errors.notFound('Attempt');
    return attempt;
  }

  private async expired(attempt: Attempt, now: Date): Promise<boolean> {
    if (!attempt.deadlineAt) return false;
    const { graceSeconds } = await this.settings.get('assessments.timing');
    return now.getTime() > attempt.deadlineAt.getTime() + graceSeconds * 1000;
  }

  private counted(a: Assessment, attempts: Attempt[]) {
    const finished = attempts.filter(
      (t) => !t.practice && (FINISHED as readonly string[]).includes(t.status),
    );
    return countedAttempt(
      finished.map((t) => ({
        id: t.id,
        attemptNo: t.attemptNo,
        score: t.status === 'completed' ? t.score : null,
        timeTakenSeconds: t.timeTakenSeconds ?? 0,
      })),
      a.countedAttempt,
    );
  }

  private summary(a: AssessmentWithSections, allowed: boolean, attempts: Attempt[], now: Date) {
    const totals = outline(a);
    const finished = attempts.filter((t) => t.status !== 'in_progress');
    const released = resultsReleased(a, now);
    const counted = this.counted(a, attempts);
    return {
      id: a.id,
      type: a.type,
      title: a.title as LocalizedText,
      accessLevel: a.accessLevel,
      locked: !allowed,
      state: windowState(a, now),
      opensAt: a.opensAt?.toISOString() ?? null,
      closesAt: a.closesAt?.toISOString() ?? null,
      durationSeconds: a.durationSeconds,
      questionCount: totals.questions,
      totalMarks: totals.marks,
      maxAttempts: a.maxAttempts,
      challengeDate: a.challengeDate ? isoDay(a.challengeDate) : null,
      leaderboardEnabled: a.leaderboardEnabled,
      attemptsUsed: finished.length + attempts.filter((t) => t.status === 'in_progress').length,
      inProgressAttemptId: attempts.find((t) => t.status === 'in_progress')?.id ?? null,
      result:
        counted && released
          ? {
              attemptId: counted.id,
              score: counted.score,
              maxScore: attempts.find((t) => t.id === counted.id)?.maxScore ?? null,
            }
          : null,
    };
  }

  private attemptSummary(t: Attempt, released: boolean, counted: boolean) {
    const show = released && t.status !== 'in_progress';
    return {
      id: t.id,
      attemptNo: t.attemptNo,
      status: t.status,
      practice: t.practice,
      startedAt: t.startedAt.toISOString(),
      submittedAt: t.submittedAt?.toISOString() ?? null,
      released: show,
      score: show ? t.score : null,
      maxScore: t.maxScore,
      passed: show ? t.passed : null,
      counted,
    };
  }
}

// ───────────── pure helpers ─────────────

/** An empty answer (nothing chosen, blank text) is stored as "not answered". */
function answered(r: AnswerResponseInput | null): r is AnswerResponseInput {
  if (!r) return false;
  switch (r.type) {
    case 'single_choice':
      return r.optionId !== null;
    case 'multiple_choice':
      return r.optionIds.length > 0;
    case 'true_false':
    case 'numeric':
      return r.value !== null;
    case 'fill_blank':
      return Object.values(r.blanks).some((v) => v.trim() !== '');
    case 'match':
      return Object.values(r.pairs).some(Boolean);
    case 'subjective':
      return r.text.trim() !== '';
  }
}

function scoreOne(content: QuestionContent, response: unknown, q: PlannedQuestion, rules: ScoringRulesInput) {
  const { answer } = splitQuestion(content);
  const scheme: MarkScheme = { marks: q.marks, negativeMarks: q.negativeMarks };
  return scoreQuestion(
    answer as unknown as AnswerKey,
    (response as AnswerResponse | null) ?? null,
    scheme,
    rules,
  );
}

function withOptionOrder<Q extends { type: string }>(question: Q, order: string[] | null): Q {
  if (!order || !('options' in question)) return question;
  const q = question as Q & { options: Array<{ id: string }> };
  return { ...q, options: ordered(q.options, order) };
}

/** Question count and total marks shown before starting (random sections without fixed marks: total unknown). */
function outline(a: AssessmentWithSections): { questions: number; marks: number | null } {
  let questions = 0;
  let marks: number | null = 0;
  for (const s of a.sections) {
    if (s.pickMode === 'fixed') {
      const live = s.questions.filter((aq) => aq.question.status === 'published' && !aq.question.deletedAt);
      questions += live.length;
      if (marks !== null) {
        for (const aq of live)
          marks += cm(aq.marks) ?? cm(s.marksPerQuestion) ?? (cm(aq.question.defaultMarks) as number);
      }
    } else {
      questions += s.questionCount ?? 0;
      const per = cm(s.marksPerQuestion);
      marks = per === null || marks === null ? null : marks + per * (s.questionCount ?? 0);
    }
  }
  return { questions, marks };
}
