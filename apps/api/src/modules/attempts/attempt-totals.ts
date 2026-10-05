import type { ScoringRulesInput } from '@tk/contracts';
import { marksToCentimarks, totalAttempt, type QuestionScore } from '@tk/domain';
import type { Assessment, Prisma } from '../../generated/prisma/client.js';
import { planQuestions, type AttemptPlan } from './attempt-plan.js';

/** Centimarks from a stored decimal (null stays null). */
export const cm = (d: Prisma.Decimal | number | null | undefined) =>
  d === null || d === undefined ? null : marksToCentimarks(String(d));

/**
 * Recomputes an attempt's totals from its answer rows (after scoring, self-grading or instructor grading): complete
 * once no written answer awaits marks; pass/fail only then, and only when the assessment has pass marks.
 */
export async function retotalAttempt(tx: Prisma.TransactionClient, attemptId: string, a: Assessment) {
  const attempt = await tx.attempt.findUniqueOrThrow({ where: { id: attemptId } });
  const planned = new Map(
    planQuestions(attempt.plan as unknown as AttemptPlan).map((q) => [q.questionId, q]),
  );
  const rows = await tx.attemptAnswer.findMany({ where: { attemptId } });
  const items = rows.flatMap((r) => {
    const q = planned.get(r.questionId);
    if (!q) return [];
    const score: QuestionScore = { outcome: r.outcome ?? 'skipped', awarded: r.awarded ?? 0 };
    return [{ scheme: { marks: q.marks, negativeMarks: q.negativeMarks }, score }];
  });
  const totals = totalAttempt(items, (a.scoring as ScoringRulesInput).scoreFloor);
  const pass = cm(a.passMarks);
  return tx.attempt.update({
    where: { id: attemptId },
    data: {
      status: totals.pending > 0 ? 'pending_grading' : 'completed',
      score: totals.score,
      maxScore: totals.maxScore,
      correctCount: totals.correct,
      partialCount: totals.partial,
      wrongCount: totals.wrong,
      skippedCount: totals.skipped,
      pendingCount: totals.pending,
      passed: totals.pending > 0 || pass === null ? null : totals.score >= pass,
    },
  });
}
