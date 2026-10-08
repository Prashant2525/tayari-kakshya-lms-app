import type { StudyActivity } from '@tk/contracts';

/**
 * How long after the last sign of activity time still counts (D-066: idle time is never counted). Videos count while
 * they play (the player reports its position every few seconds); reading, practice and tests count after a touch,
 * scroll or key press — tests allow the longest pause, since thinking over a question is studying.
 */
export const IDLE_SECONDS: Record<StudyActivity, number> = {
  video: 30,
  reading: 120,
  practice: 180,
  test: 600,
};

export type Signal = 'touch' | 'media';

const ZERO = (): Record<StudyActivity, number> => ({ video: 0, reading: 0, practice: 0, test: 0 });

/**
 * Pure study-time accounting: one activity at a time (the innermost open screen), counted only while the student
 * was active recently and the app is in the foreground. Times are milliseconds; `drain` hands out whole seconds.
 */
export class StudyMeter {
  /** Open screens, innermost last; only the last one counts. */
  private screens: Array<{ id: number; activity: StudyActivity }> = [];
  private nextId = 1;
  private lastActive = 0;
  /** When time was last credited; null before the first screen opens. */
  private lastTick: number | null = null;
  private paused = false;
  private pending = ZERO();

  get current(): StudyActivity | null {
    return this.paused ? null : (this.screens.at(-1)?.activity ?? null);
  }

  /** A screen that counts as `activity` opened (or came back into focus). Returns a handle for `close`. */
  open(activity: StudyActivity, now: number): number {
    this.tick(now);
    const id = this.nextId++;
    this.screens.push({ id, activity });
    this.lastActive = now;
    return id;
  }

  close(id: number, now: number): void {
    this.tick(now);
    this.screens = this.screens.filter((s) => s.id !== id);
    // The screen below starts afresh: time spent on the closed one is not carried over.
    this.lastActive = now;
  }

  /** A touch, scroll or key press — or, for videos, the player reporting that it is playing. */
  signal(kind: Signal, now: number): void {
    const current = this.current;
    if (!current) return;
    if (current === 'video' && kind !== 'media') return;
    this.tick(now);
    this.lastActive = now;
  }

  /** The app went to the background (nothing counts) or came back (counting starts again from now). */
  setForeground(foreground: boolean, now: number): void {
    if (!foreground) {
      this.tick(now);
      this.paused = true;
    } else if (this.paused) {
      this.paused = false;
      this.lastTick = now;
      this.lastActive = now;
    }
  }

  /** Credits the time since the last tick that falls within the idle limit after the last activity. */
  tick(now: number): void {
    const current = this.current;
    if (current && this.lastTick !== null) {
      const activeUntil = this.lastActive + IDLE_SECONDS[current] * 1000;
      const credited = Math.min(now, activeUntil) - this.lastTick;
      if (credited > 0) this.pending[current] += credited;
    }
    this.lastTick = now;
  }

  /** Whole seconds counted so far per activity (removed from the meter; fractions stay for next time). */
  drain(now: number): Array<{ activity: StudyActivity; seconds: number }> {
    this.tick(now);
    const out: Array<{ activity: StudyActivity; seconds: number }> = [];
    for (const activity of Object.keys(this.pending) as StudyActivity[]) {
      const seconds = Math.floor(this.pending[activity] / 1000);
      if (seconds > 0) {
        out.push({ activity, seconds });
        this.pending[activity] -= seconds * 1000;
      }
    }
    return out;
  }

  /** Gives seconds back after a report could not be sent, so they go with the next one. */
  restore(activity: StudyActivity, seconds: number): void {
    this.pending[activity] = Math.min(this.pending[activity] + seconds * 1000, 3_600_000);
  }
}
