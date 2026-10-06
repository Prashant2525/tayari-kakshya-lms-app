import { describe, expect, it } from 'vitest';
import { isMistake, practiceOutcome, recordMistake, reviewMistake, type MistakeState } from './mistakes.js';
import type { AnswerKey } from '../assessment/scoring.js';

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 6, 6, minutes));

describe('practice feedback', () => {
  it('tells correct, partly correct and wrong apart; written answers are self-reviewed', () => {
    const multi: AnswerKey = { type: 'multiple_choice', correctOptionIds: ['a', 'c'] };
    expect(practiceOutcome(multi, { type: 'multiple_choice', optionIds: ['a', 'c'] })).toBe('correct');
    expect(practiceOutcome(multi, { type: 'multiple_choice', optionIds: ['a'] })).toBe('partial');
    expect(practiceOutcome(multi, { type: 'multiple_choice', optionIds: ['a', 'b'] })).toBe('wrong');
    expect(practiceOutcome(multi, null)).toBe('skipped');
    expect(practiceOutcome({ type: 'subjective' }, { type: 'subjective', text: 'x' })).toBe('pending');
  });

  it('counts wrong and partly correct as mistakes, not skipped or pending (D-050)', () => {
    expect(
      ['correct', 'partial', 'wrong', 'skipped', 'pending', null].map((o) => isMistake(o as never)),
    ).toEqual([false, true, true, false, false, false]);
  });
});

describe('mistake notebook (D-050)', () => {
  it('adds a first mistake, masters it after N correct revisions in a row, and a wrong one resets the run', () => {
    let s = recordMistake(null, at(0));
    expect(s).toMatchObject({ status: 'active', timesWrong: 1, correctStreak: 0 });
    s = reviewMistake(s, true, at(1), 2);
    expect(s).toMatchObject({ status: 'active', correctStreak: 1, masteredAt: null });
    s = reviewMistake(s, false, at(2), 2);
    expect(s).toMatchObject({ status: 'active', correctStreak: 0, timesWrong: 2, lastWrongAt: at(2) });
    s = reviewMistake(reviewMistake(s, true, at(3), 2), true, at(4), 2);
    expect(s).toMatchObject({ status: 'mastered', correctStreak: 2, masteredAt: at(4) });
    // With N = 1 one correct answer is enough.
    expect(reviewMistake(recordMistake(null, at(0)), true, at(1), 1).status).toBe('mastered');
  });

  it('brings a mastered or removed question back on a new mistake, with its history', () => {
    const mastered: MistakeState = {
      status: 'mastered',
      timesWrong: 3,
      correctStreak: 2,
      lastWrongAt: at(1),
      lastReviewedAt: at(5),
      masteredAt: at(5),
    };
    expect(recordMistake(mastered, at(9))).toEqual({
      status: 'active',
      timesWrong: 4,
      correctStreak: 0,
      lastWrongAt: at(9),
      lastReviewedAt: at(5),
      masteredAt: null,
    });
    expect(recordMistake({ ...mastered, status: 'removed', masteredAt: null }, at(9)).status).toBe('active');
  });

  it('only counts a mistake older than the latest revision (results released late) in the history', () => {
    const s: MistakeState = {
      status: 'mastered',
      timesWrong: 1,
      correctStreak: 2,
      lastWrongAt: at(0),
      lastReviewedAt: at(10),
      masteredAt: at(10),
    };
    expect(recordMistake(s, at(5))).toEqual({ ...s, timesWrong: 2, lastWrongAt: at(5) });
  });
});
