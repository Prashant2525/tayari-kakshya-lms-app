import { describe, expect, it } from 'vitest';
import { leaderboardName, rankEntries } from './leaderboard.js';
import { advanceStreak, streakOn, type StreakState } from './streak.js';

const none: StreakState = { current: 0, longest: 0, lastDay: null };

describe('daily-challenge streak (D-049)', () => {
  it('starts, extends on the next day, ignores the same day and restarts after a gap', () => {
    let s = advanceStreak(none, '2026-10-06');
    expect(s).toEqual({ current: 1, longest: 1, lastDay: '2026-10-06' });
    s = advanceStreak(s, '2026-10-06');
    expect(s.current).toBe(1);
    s = advanceStreak(advanceStreak(s, '2026-10-07'), '2026-10-08');
    expect(s).toEqual({ current: 3, longest: 3, lastDay: '2026-10-08' });
    s = advanceStreak(s, '2026-10-10');
    expect(s).toEqual({ current: 1, longest: 3, lastDay: '2026-10-10' });
    expect(advanceStreak(s, '2026-10-01')).toBe(s); // an older day never rewinds it
    // Month and year boundaries.
    expect(advanceStreak({ current: 4, longest: 4, lastDay: '2026-12-31' }, '2027-01-01').current).toBe(5);
  });

  it('shows the streak while it is alive (counted today or yesterday), otherwise 0', () => {
    const s: StreakState = { current: 5, longest: 9, lastDay: '2026-10-06' };
    expect(streakOn(s, '2026-10-06')).toBe(5);
    expect(streakOn(s, '2026-10-07')).toBe(5);
    expect(streakOn(s, '2026-10-08')).toBe(0);
    expect(streakOn(none, '2026-10-06')).toBe(0);
  });
});

describe('leaderboards (D-049)', () => {
  it('shows first name + initial, the full name, or nothing', () => {
    expect(leaderboardName('Aarati Sharma', 'first_initial')).toBe('Aarati S.');
    expect(leaderboardName('  Ram  Bahadur  Thapa ', 'first_initial')).toBe('Ram T.');
    expect(leaderboardName('सीता थापा', 'first_initial')).toBe('सीता थ.');
    expect(leaderboardName('Gita', 'first_initial')).toBe('Gita');
    expect(leaderboardName('Aarati Sharma', 'full')).toBe('Aarati Sharma');
    expect(leaderboardName('Aarati Sharma', 'none')).toBeNull();
  });

  it('ranks by score, then time; equal score and time share a rank', () => {
    const ranked = rankEntries([
      { id: 'a', score: 500, timeTakenSeconds: 300 },
      { id: 'b', score: 700, timeTakenSeconds: 400 },
      { id: 'c', score: 500, timeTakenSeconds: 300 },
      { id: 'd', score: 500, timeTakenSeconds: 200 },
      { id: 'e', score: 100, timeTakenSeconds: 100 },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ['b', 1],
      ['d', 2],
      ['a', 3],
      ['c', 3],
      ['e', 5],
    ]);
  });
});
