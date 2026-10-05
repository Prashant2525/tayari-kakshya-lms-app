/**
 * Daily-challenge streaks (D-049). Days are Nepal calendar dates as `YYYY-MM-DD`; a day counts when that day's
 * challenge is submitted on its day.
 */
export interface StreakState {
  current: number;
  longest: number;
  /** The last day that counted (null = never). */
  lastDay: string | null;
}

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/** The streak after `day` counts: the same day changes nothing, the next day extends it, a gap starts over. */
export function advanceStreak(state: StreakState, day: string): StreakState {
  if (state.lastDay === day) return state;
  if (state.lastDay && dayNumber(day) < dayNumber(state.lastDay)) return state;
  const current = state.lastDay && dayNumber(day) - dayNumber(state.lastDay) === 1 ? state.current + 1 : 1;
  return { current, longest: Math.max(state.longest, current), lastDay: day };
}

/** The streak shown on `today`: still alive if the last counted day is today or yesterday, otherwise 0. */
export function streakOn(state: StreakState, today: string): number {
  if (!state.lastDay) return 0;
  return dayNumber(today) - dayNumber(state.lastDay) <= 1 ? state.current : 0;
}
