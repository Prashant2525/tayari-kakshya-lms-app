import { describe, expect, it } from 'vitest';
import type { PracticeAnswer } from '@/api/learning';
import { markBlanks, practiceOutcome } from './practice';

describe('practiceOutcome', () => {
  it('tells correct, wrong and skipped apart for a single choice', () => {
    const key = { type: 'single_choice', correctOptionId: 'b', explanation: null } satisfies PracticeAnswer;
    expect(practiceOutcome(key, { type: 'single_choice', optionId: 'b' })).toBe('correct');
    expect(practiceOutcome(key, { type: 'single_choice', optionId: 'a' })).toBe('wrong');
    expect(practiceOutcome(key, null)).toBe('skipped');
  });

  it('gives partial feedback for an incomplete multiple choice, match and fill in the blank', () => {
    const multi = {
      type: 'multiple_choice',
      correctOptionIds: ['a', 'c'],
      explanation: null,
    } satisfies PracticeAnswer;
    expect(practiceOutcome(multi, { type: 'multiple_choice', optionIds: ['a'] })).toBe('partial');
    expect(practiceOutcome(multi, { type: 'multiple_choice', optionIds: ['a', 'b'] })).toBe('wrong');
    expect(practiceOutcome(multi, { type: 'multiple_choice', optionIds: ['c', 'a'] })).toBe('correct');

    const match = {
      type: 'match',
      pairs: { l1: 'r1', l2: 'r2' },
      explanation: null,
    } satisfies PracticeAnswer;
    expect(practiceOutcome(match, { type: 'match', pairs: { l1: 'r1', l2: 'r1' } })).toBe('partial');

    const blank = {
      type: 'fill_blank',
      blanks: [
        { id: 'b1', accepted: ['Kathmandu'], caseSensitive: false },
        { id: 'b2', accepted: ['7'], caseSensitive: false },
      ],
      explanation: null,
    } satisfies PracticeAnswer;
    expect(practiceOutcome(blank, { type: 'fill_blank', blanks: { b1: 'kathmandu', b2: '7' } })).toBe(
      'correct',
    );
    expect(practiceOutcome(blank, { type: 'fill_blank', blanks: { b1: 'kathmandu', b2: '' } })).toBe(
      'partial',
    );
  });

  it('accepts a numeric answer within the tolerance and leaves subjective answers to the student', () => {
    const numeric = {
      type: 'numeric',
      value: 10,
      tolerance: 0.5,
      explanation: null,
    } satisfies PracticeAnswer;
    expect(practiceOutcome(numeric, { type: 'numeric', value: 10.4 })).toBe('correct');
    expect(practiceOutcome(numeric, { type: 'numeric', value: 11 })).toBe('wrong');
    const subjective = {
      type: 'subjective',
      modelAnswer: { en: { type: 'doc' } },
      explanation: null,
    } satisfies PracticeAnswer;
    expect(practiceOutcome(subjective, { type: 'subjective', text: 'My answer' })).toBe('pending');
  });
});

describe('markBlanks', () => {
  it('numbers the gaps in order of the answer key, deep in the document', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Capital: [[b2]], provinces: [[b1]], other: [[zz]].' }],
        },
      ],
    };
    const out = markBlanks(doc, ['b1', 'b2']);
    expect(out.content?.[0]?.content?.[0]?.text).toBe(
      'Capital: ____ (2), provinces: ____ (1), other: ____ (?).',
    );
    expect(doc.content[0]!.content[0]!.text).toContain('[[b2]]');
  });
});
