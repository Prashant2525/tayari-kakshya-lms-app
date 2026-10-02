import { describe, expect, it } from 'vitest';
import {
  formatMarks,
  gradeSubjective,
  marksToCentimarks,
  normalizeBlank,
  scoreQuestion,
  ScoringError,
  totalAttempt,
  type AnswerKey,
  type PartialCreditRules,
} from './scoring.js';

// Marks and rules below are arbitrary test inputs, not business values.
const scheme = { marks: 200, negativeMarks: 40 }; // 2 marks, -0.4 when wrong
const strict: PartialCreditRules = {
  multipleChoice: 'all_or_nothing',
  match: 'all_or_nothing',
  fillBlank: 'all_or_nothing',
};
const partial: PartialCreditRules = {
  multipleChoice: 'partial_if_no_wrong',
  match: 'per_pair',
  fillBlank: 'per_blank',
};

describe('single choice and true/false', () => {
  const key: AnswerKey = { type: 'single_choice', correctOptionId: 'b' };
  it('scores correct, wrong and skipped answers', () => {
    expect(scoreQuestion(key, { type: 'single_choice', optionId: 'b' }, scheme, strict)).toEqual({
      outcome: 'correct',
      awarded: 200,
    });
    expect(scoreQuestion(key, { type: 'single_choice', optionId: 'a' }, scheme, strict)).toEqual({
      outcome: 'wrong',
      awarded: -40,
    });
    expect(scoreQuestion(key, { type: 'single_choice', optionId: null }, scheme, strict)).toEqual({
      outcome: 'skipped',
      awarded: 0,
    });
    expect(scoreQuestion(key, null, scheme, strict)).toEqual({ outcome: 'skipped', awarded: 0 });
  });
  it('never deducts when negative marking is off', () => {
    expect(
      scoreQuestion(key, { type: 'single_choice', optionId: 'a' }, { marks: 100, negativeMarks: 0 }, strict),
    ).toEqual({
      outcome: 'wrong',
      awarded: 0,
    });
    expect(
      Object.is(
        scoreQuestion(key, { type: 'single_choice', optionId: 'a' }, { marks: 100, negativeMarks: 0 }, strict)
          .awarded,
        -0,
      ),
    ).toBe(false);
  });
  it('scores true/false including a "false" answer', () => {
    const tf: AnswerKey = { type: 'true_false', correct: false };
    expect(scoreQuestion(tf, { type: 'true_false', value: false }, scheme, strict).outcome).toBe('correct');
    expect(scoreQuestion(tf, { type: 'true_false', value: true }, scheme, strict).outcome).toBe('wrong');
    expect(scoreQuestion(tf, { type: 'true_false', value: null }, scheme, strict).outcome).toBe('skipped');
  });
});

describe('multiple answers', () => {
  const key: AnswerKey = { type: 'multiple_choice', correctOptionIds: ['a', 'c', 'd'] };
  const answer = (...ids: string[]) => ({ type: 'multiple_choice' as const, optionIds: ids });
  it('all-or-nothing: only the exact set earns marks', () => {
    expect(scoreQuestion(key, answer('d', 'a', 'c'), scheme, strict)).toEqual({
      outcome: 'correct',
      awarded: 200,
    });
    expect(scoreQuestion(key, answer('a', 'c'), scheme, strict)).toEqual({ outcome: 'wrong', awarded: -40 });
    expect(scoreQuestion(key, answer('a', 'b'), scheme, strict)).toEqual({ outcome: 'wrong', awarded: -40 });
    expect(scoreQuestion(key, answer(), scheme, strict).outcome).toBe('skipped');
  });
  it('partial: proportional when no wrong option is chosen, rounded half up', () => {
    expect(scoreQuestion(key, answer('a', 'c'), scheme, partial)).toEqual({
      outcome: 'partial',
      awarded: 133,
    }); // 200 × 2/3
    expect(scoreQuestion(key, answer('a'), scheme, partial)).toEqual({ outcome: 'partial', awarded: 67 }); // 66.67 → 67
    expect(scoreQuestion(key, answer('a', 'b'), scheme, partial)).toEqual({ outcome: 'wrong', awarded: -40 });
    expect(scoreQuestion(key, answer('a', 'c', 'd'), scheme, partial).outcome).toBe('correct');
  });
  it('ignores duplicate selections', () => {
    expect(scoreQuestion(key, answer('a', 'a', 'c', 'd'), scheme, strict).outcome).toBe('correct');
  });
});

describe('match the following', () => {
  const key: AnswerKey = { type: 'match', pairs: { l1: 'r3', l2: 'r1', l3: 'r2', l4: 'r4' } };
  it('all-or-nothing vs per pair', () => {
    const half = { type: 'match' as const, pairs: { l1: 'r3', l2: 'r1', l3: 'r4', l4: 'r2' } };
    expect(scoreQuestion(key, half, scheme, strict)).toEqual({ outcome: 'wrong', awarded: -40 });
    expect(scoreQuestion(key, half, scheme, partial)).toEqual({ outcome: 'partial', awarded: 100 });
    const none = { type: 'match' as const, pairs: { l1: 'r1', l2: 'r2' } };
    expect(scoreQuestion(key, none, scheme, partial)).toEqual({ outcome: 'wrong', awarded: -40 });
    expect(scoreQuestion(key, { type: 'match', pairs: { l1: '' } }, scheme, partial).outcome).toBe('skipped');
    expect(scoreQuestion(key, { type: 'match', pairs: { ...key.pairs } }, scheme, strict).outcome).toBe(
      'correct',
    );
  });
});

describe('fill in the blank', () => {
  const key: AnswerKey = {
    type: 'fill_blank',
    blanks: [
      { id: 'b1', accepted: ['Kathmandu', 'काठमाडौं'], caseSensitive: false },
      { id: 'b2', accepted: ['2072'], caseSensitive: false },
      { id: 'b3', accepted: ['NaCl'], caseSensitive: true },
    ],
  };
  const answer = (b1: string, b2: string, b3: string) => ({
    type: 'fill_blank' as const,
    blanks: { b1, b2, b3 },
  });
  it('normalises case, spacing, Unicode form and Devanagari digits', () => {
    expect(scoreQuestion(key, answer('  kathMANDU ', '२०७२', 'NaCl'), scheme, strict).outcome).toBe(
      'correct',
    );
    expect(scoreQuestion(key, answer('काठमाडौं', '2072', 'NaCl'), scheme, strict).outcome).toBe('correct');
    expect(normalizeBlank('Ram   Bahadur', false)).toBe('ram bahadur');
  });
  it('respects case-sensitive blanks', () => {
    expect(scoreQuestion(key, answer('Kathmandu', '2072', 'nacl'), scheme, strict).outcome).toBe('wrong');
  });
  it('per blank gives partial credit; nothing right is wrong; nothing typed is skipped', () => {
    expect(scoreQuestion(key, answer('Kathmandu', '2073', 'nacl'), scheme, partial)).toEqual({
      outcome: 'partial',
      awarded: 67,
    });
    expect(scoreQuestion(key, answer('Pokhara', '1', ''), scheme, partial)).toEqual({
      outcome: 'wrong',
      awarded: -40,
    });
    expect(scoreQuestion(key, answer(' ', '', ''), scheme, partial).outcome).toBe('skipped');
  });
});

describe('numeric', () => {
  const key: AnswerKey = { type: 'numeric', value: 0.3, tolerance: 0 };
  it('accepts values within tolerance and absorbs floating-point error', () => {
    expect(scoreQuestion(key, { type: 'numeric', value: 0.1 + 0.2 }, scheme, strict).outcome).toBe('correct');
    expect(scoreQuestion(key, { type: 'numeric', value: 0.31 }, scheme, strict).outcome).toBe('wrong');
    const tolerant: AnswerKey = { type: 'numeric', value: 9.8, tolerance: 0.05 };
    expect(scoreQuestion(tolerant, { type: 'numeric', value: 9.85 }, scheme, strict).outcome).toBe('correct');
    expect(scoreQuestion(tolerant, { type: 'numeric', value: 9.86 }, scheme, strict).outcome).toBe('wrong');
    expect(scoreQuestion(key, { type: 'numeric', value: null }, scheme, strict).outcome).toBe('skipped');
    expect(scoreQuestion(key, { type: 'numeric', value: Number.NaN }, scheme, strict).outcome).toBe(
      'skipped',
    );
  });
});

describe('subjective', () => {
  const key: AnswerKey = { type: 'subjective' };
  it('waits for grading and is graded within 0..marks', () => {
    expect(scoreQuestion(key, { type: 'subjective', text: 'My answer' }, scheme, strict)).toEqual({
      outcome: 'pending',
      awarded: 0,
    });
    expect(scoreQuestion(key, { type: 'subjective', text: '   ' }, scheme, strict).outcome).toBe('skipped');
    expect(gradeSubjective(150, scheme)).toEqual({ outcome: 'partial', awarded: 150 });
    expect(gradeSubjective(200, scheme).outcome).toBe('correct');
    expect(gradeSubjective(0, scheme).outcome).toBe('wrong');
    expect(() => gradeSubjective(201, scheme)).toThrow(ScoringError);
    expect(() => gradeSubjective(-1, scheme)).toThrow(ScoringError);
  });
});

describe('guards', () => {
  it('rejects mismatched answers and invalid schemes', () => {
    expect(() =>
      scoreQuestion(
        { type: 'single_choice', correctOptionId: 'a' },
        { type: 'true_false', value: true },
        scheme,
        strict,
      ),
    ).toThrow(ScoringError);
    expect(() =>
      scoreQuestion(
        { type: 'single_choice', correctOptionId: 'a' },
        null,
        { marks: 1.5, negativeMarks: 0 },
        strict,
      ),
    ).toThrow(ScoringError);
    expect(() =>
      scoreQuestion(
        { type: 'multiple_choice', correctOptionIds: [] },
        { type: 'multiple_choice', optionIds: ['a'] },
        scheme,
        strict,
      ),
    ).toThrow(ScoringError);
  });
});

describe('attempt totals', () => {
  it('sums exactly in centimarks and applies the floor only when chosen', () => {
    const s = { marks: 100, negativeMarks: 25 };
    const items = [
      { scheme: s, score: { outcome: 'wrong' as const, awarded: -25 } },
      { scheme: s, score: { outcome: 'wrong' as const, awarded: -25 } },
      { scheme: s, score: { outcome: 'skipped' as const, awarded: 0 } },
      { scheme: s, score: { outcome: 'pending' as const, awarded: 0 } },
    ];
    expect(totalAttempt(items, 'none')).toEqual({
      score: -50,
      maxScore: 400,
      correct: 0,
      partial: 0,
      wrong: 2,
      skipped: 1,
      pending: 1,
    });
    expect(totalAttempt(items, 'zero').score).toBe(0);
    // 0.1 + 0.2 style sums stay exact: 3 × 33 + 1 = 100.
    const thirds = [33, 33, 33, 1].map((a) => ({
      scheme: s,
      score: { outcome: 'partial' as const, awarded: a },
    }));
    expect(totalAttempt(thirds, 'none').score).toBe(100);
  });
  it('converts and formats marks', () => {
    expect(marksToCentimarks('0.25')).toBe(25);
    expect(marksToCentimarks(2)).toBe(200);
    expect(marksToCentimarks('1.5')).toBe(150);
    expect(() => marksToCentimarks('0.255')).toThrow(ScoringError);
    expect(() => marksToCentimarks('-1')).toThrow(ScoringError);
    expect(formatMarks(150)).toBe('1.5');
    expect(formatMarks(-25)).toBe('-0.25');
    expect(formatMarks(200)).toBe('2');
    expect(formatMarks(105)).toBe('1.05');
  });
});
