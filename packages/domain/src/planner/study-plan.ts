/**
 * Study planner (S7, D-066): the student's unfinished lessons and tests, in course order, spread over the Nepal days
 * from today until the day before the exam, about `minutesPerDay` a day. The plan is worked out afresh whenever it is
 * asked for, so a student who falls behind (or gets ahead) is re-planned from today automatically.
 */

export interface PlanTask {
  id: string;
  /** Estimated minutes (at least 1). */
  minutes: number;
  done: boolean;
  /** Nepal day (`YYYY-MM-DD`) it was finished — today's finished work stays in today's plan. */
  doneDay?: string | null;
  /** A test that opens later (Nepal day): not planned before it opens. */
  opensDay?: string | null;
}

export interface PlannedDay<T> {
  day: string;
  minutes: number;
  tasks: T[];
}

export interface StudyPlan<T> {
  /** Today first (always present while the exam is ahead), then each day with planned work. */
  days: Array<PlannedDay<T>>;
  /** Work that does not fit before the exam at this pace (in course order). */
  unscheduled: T[];
  /** Days to study: today up to the day before the exam. */
  studyDays: number;
  minutesLeft: number;
  /** Minutes a day needed to finish everything left before the exam; null when no days are left. */
  neededMinutesPerDay: number | null;
  onTrack: boolean;
}

const DAY_MS = 86_400_000;
const toTime = (day: string) => Date.parse(`${day}T00:00:00Z`);
export const planDayAdd = (day: string, n: number) =>
  new Date(toTime(day) + n * DAY_MS).toISOString().slice(0, 10);
export const planDaysBetween = (from: string, to: string) => Math.round((toTime(to) - toTime(from)) / DAY_MS);

export function buildStudyPlan<T extends PlanTask>(
  tasks: readonly T[],
  options: { today: string; examDay: string; minutesPerDay: number },
): StudyPlan<T> {
  const { today, examDay, minutesPerDay } = options;
  const studyDays = Math.max(0, planDaysBetween(today, examDay));
  const remaining = tasks.filter((t) => !t.done);
  const minutesLeft = remaining.reduce((sum, t) => sum + t.minutes, 0);
  const doneToday = tasks.filter((t) => t.done && t.doneDay === today);

  const days: Array<PlannedDay<T>> = [];
  const queue = [...remaining];
  let waiting: T[] = [];
  for (let i = 0; i < studyDays; i++) {
    const day = planDayAdd(today, i);
    const planned: PlannedDay<T> =
      i === 0
        ? { day, minutes: doneToday.reduce((s, t) => s + t.minutes, 0), tasks: [...doneToday] }
        : { day, minutes: 0, tasks: [] };
    // Tests that have opened by now come first, then the course order.
    const opened = waiting.filter((t) => !t.opensDay || t.opensDay <= day);
    waiting = waiting.filter((t) => !opened.includes(t));
    const candidates = [...opened, ...queue.splice(0)];
    const later: T[] = [];
    for (const t of candidates) {
      if (t.opensDay && t.opensDay > day) {
        waiting.push(t);
        continue;
      }
      const full = planned.minutes >= minutesPerDay;
      const tooBig = planned.minutes > 0 && planned.minutes + t.minutes > minutesPerDay;
      if (full || tooBig || later.length) {
        later.push(t);
        continue;
      }
      planned.tasks.push(t);
      planned.minutes += t.minutes;
    }
    queue.push(...later);
    if (i === 0 || planned.tasks.length) days.push(planned);
    if (!queue.length && !waiting.length) break;
  }
  // Keep the course order for what does not fit.
  const left = new Set([...queue, ...waiting]);
  const unscheduled = remaining.filter((t) => left.has(t));

  return {
    days,
    unscheduled,
    studyDays,
    minutesLeft,
    neededMinutesPerDay: studyDays > 0 ? Math.ceil(minutesLeft / studyDays) : null,
    onTrack: unscheduled.length === 0,
  };
}
