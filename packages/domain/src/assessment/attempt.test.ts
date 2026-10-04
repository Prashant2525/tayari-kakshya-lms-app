import { describe, expect, it } from 'vitest';
import {
  attemptDeadline,
  countedAttempt,
  releaseDate,
  resultsReleased,
  windowState,
  type AssessmentTiming,
} from './attempt.js';

const at = (iso: string) => new Date(iso);
const window = (overrides: Partial<AssessmentTiming> = {}): AssessmentTiming => ({
  availability: 'window',
  opensAt: at('2026-10-10T09:00:00Z'),
  closesAt: at('2026-10-10T11:00:00Z'),
  durationSeconds: 3600,
  lateStart: 'until_close',
  ...overrides,
});

describe('window state', () => {
  it('is upcoming before it opens, open until it closes, then closed', () => {
    expect(windowState(window(), at('2026-10-10T08:59:59Z'))).toBe('upcoming');
    expect(windowState(window(), at('2026-10-10T09:00:00Z'))).toBe('open');
    expect(windowState(window(), at('2026-10-10T10:59:59Z'))).toBe('open');
    expect(windowState(window(), at('2026-10-10T11:00:00Z'))).toBe('closed');
    expect(
      windowState({ availability: 'always', opensAt: null, closesAt: null }, at('2030-01-01T00:00:00Z')),
    ).toBe('open');
  });
});

describe('attempt deadline (D-048 late start)', () => {
  it('gives the full duration when there is time before the close', () => {
    expect(attemptDeadline(window(), at('2026-10-10T09:30:00Z'))).toEqual(at('2026-10-10T10:30:00Z'));
  });

  it('ends a late attempt at the close with until_close, or runs the full duration with full_duration', () => {
    const late = at('2026-10-10T10:50:00Z');
    expect(attemptDeadline(window(), late)).toEqual(at('2026-10-10T11:00:00Z'));
    expect(attemptDeadline(window({ lateStart: 'full_duration' }), late)).toEqual(at('2026-10-10T11:50:00Z'));
  });

  it('ends an untimed window attempt at the close only with until_close; always-open untimed has no deadline', () => {
    const start = at('2026-10-10T10:00:00Z');
    expect(attemptDeadline(window({ durationSeconds: null }), start)).toEqual(at('2026-10-10T11:00:00Z'));
    expect(attemptDeadline(window({ durationSeconds: null, lateStart: 'full_duration' }), start)).toBeNull();
    expect(
      attemptDeadline(
        {
          availability: 'always',
          opensAt: null,
          closesAt: null,
          durationSeconds: null,
          lateStart: 'until_close',
        },
        start,
      ),
    ).toBeNull();
    expect(
      attemptDeadline(
        {
          availability: 'always',
          opensAt: null,
          closesAt: null,
          durationSeconds: 600,
          lateStart: 'until_close',
        },
        start,
      ),
    ).toEqual(at('2026-10-10T10:10:00Z'));
  });
});

describe('result release', () => {
  const closesAt = at('2026-10-10T11:00:00Z');
  it('follows the assessment rule', () => {
    expect(
      resultsReleased({ resultRelease: 'immediate', closesAt: null, resultsReleasedAt: null }, closesAt),
    ).toBe(true);
    const afterClose = { resultRelease: 'after_close' as const, closesAt, resultsReleasedAt: null };
    expect(resultsReleased(afterClose, at('2026-10-10T10:59:00Z'))).toBe(false);
    expect(resultsReleased(afterClose, closesAt)).toBe(true);
    expect(releaseDate(afterClose)).toEqual(closesAt);
    const manual = { resultRelease: 'manual' as const, closesAt, resultsReleasedAt: null };
    expect(resultsReleased(manual, at('2030-01-01T00:00:00Z'))).toBe(false);
    expect(releaseDate(manual)).toBeNull();
    expect(resultsReleased({ ...manual, resultsReleasedAt: closesAt }, closesAt)).toBe(true);
  });
});

describe('counted attempt (D-048)', () => {
  const attempts = [
    { id: 'a1', attemptNo: 1, score: 4000, timeTakenSeconds: 900 },
    { id: 'a2', attemptNo: 2, score: 7000, timeTakenSeconds: 1200 },
    { id: 'a3', attemptNo: 3, score: 7000, timeTakenSeconds: 1000 },
    { id: 'a4', attemptNo: 4, score: null, timeTakenSeconds: 300 },
  ];
  it('picks the first, the latest, or the best score with the faster time', () => {
    expect(countedAttempt(attempts, 'first')?.id).toBe('a1');
    expect(countedAttempt(attempts, 'latest')?.id).toBe('a4');
    expect(countedAttempt(attempts, 'best')?.id).toBe('a3');
    expect(countedAttempt([], 'first')).toBeNull();
    expect(countedAttempt([attempts[3]!], 'best')).toBeNull();
  });
});
