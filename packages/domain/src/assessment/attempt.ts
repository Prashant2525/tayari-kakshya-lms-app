/**
 * Attempt rules (§10, D-021, D-048). Pure functions: the API applies them with the server clock; the app only
 * displays their results.
 */

export interface AssessmentTiming {
  availability: 'always' | 'window';
  opensAt: Date | null;
  closesAt: Date | null;
  durationSeconds: number | null;
  lateStart: 'until_close' | 'full_duration';
}

export type WindowState = 'upcoming' | 'open' | 'closed';

/** Whether an assessment can be started at `now` (always-available assessments are always open). */
export function windowState(
  t: Pick<AssessmentTiming, 'availability' | 'opensAt' | 'closesAt'>,
  now: Date,
): WindowState {
  if (t.availability === 'always') return 'open';
  if (t.opensAt && now < t.opensAt) return 'upcoming';
  if (t.closesAt && now >= t.closesAt) return 'closed';
  return 'open';
}

/**
 * When an attempt started at `startedAt` must end (null = no time limit). With `until_close`, a window's close also
 * ends the attempt — a timed attempt started late gets less time, and an untimed one ends at the close.
 */
export function attemptDeadline(t: AssessmentTiming, startedAt: Date): Date | null {
  const byDuration = t.durationSeconds ? new Date(startedAt.getTime() + t.durationSeconds * 1000) : null;
  if (t.availability !== 'window' || !t.closesAt || t.lateStart === 'full_duration') return byDuration;
  return byDuration && byDuration < t.closesAt ? byDuration : t.closesAt;
}

export interface ReleaseRule {
  resultRelease: 'immediate' | 'after_close' | 'manual';
  closesAt: Date | null;
  resultsReleasedAt: Date | null;
}

/** Whether scores (and solutions) of submitted attempts may be shown at `now`. */
export function resultsReleased(r: ReleaseRule, now: Date): boolean {
  if (r.resultRelease === 'immediate') return true;
  if (r.resultRelease === 'after_close') return Boolean(r.closesAt && now >= r.closesAt);
  return Boolean(r.resultsReleasedAt && now >= r.resultsReleasedAt);
}

/** When results become visible, if known in advance (manual release has no date until staff release them). */
export function releaseDate(r: ReleaseRule): Date | null {
  if (r.resultRelease === 'after_close') return r.closesAt;
  if (r.resultRelease === 'manual') return r.resultsReleasedAt;
  return null;
}

export interface FinishedAttempt {
  id: string;
  attemptNo: number;
  /** Centimarks; null while written answers still await grading. */
  score: number | null;
  timeTakenSeconds: number;
}

/**
 * The attempt that is the student's official result (D-048): the first or latest submitted attempt, or the best
 * score (a faster time breaks a tie, then the earlier attempt). Attempts still awaiting grading cannot be "best".
 */
export function countedAttempt(
  attempts: FinishedAttempt[],
  rule: 'first' | 'best' | 'latest',
): FinishedAttempt | null {
  if (!attempts.length) return null;
  const byNo = [...attempts].sort((a, b) => a.attemptNo - b.attemptNo);
  if (rule === 'first') return byNo[0] ?? null;
  if (rule === 'latest') return byNo[byNo.length - 1] ?? null;
  const scored = byNo.filter((a) => a.score !== null);
  let best: FinishedAttempt | null = null;
  for (const a of scored) {
    if (
      !best ||
      (a.score as number) > (best.score as number) ||
      (a.score === best.score && a.timeTakenSeconds < best.timeTakenSeconds)
    ) {
      best = a;
    }
  }
  return best;
}
