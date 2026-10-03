import type { QuestionContent } from '@tk/contracts';
import { describe, expect, it } from 'vitest';
import { mediaIdsIn, splitQuestion } from './practice-view.js';

const doc = (text: string) => ({
  en: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});
const opts = [
  { id: 'a', content: doc('A') },
  { id: 'b', content: doc('B') },
];

/** Every question type, each with an answer marker that must never appear in the question part. */
const samples: QuestionContent[] = [
  {
    type: 'single_choice',
    stem: doc('Q'),
    options: opts,
    correctOptionId: 'b',
    explanation: doc('ANSWER-1'),
  },
  {
    type: 'multiple_choice',
    stem: doc('Q'),
    options: opts,
    correctOptionIds: ['a', 'b'],
    explanation: doc('ANSWER-2'),
  },
  { type: 'true_false', stem: doc('Q'), correct: true, explanation: doc('ANSWER-3') },
  {
    type: 'fill_blank',
    stem: doc('Water boils at [[b1]] C'),
    blanks: [{ id: 'b1', accepted: ['ANSWER-4'], caseSensitive: false }],
    explanation: null,
  },
  {
    type: 'match',
    stem: doc('Q'),
    left: opts,
    right: opts,
    pairs: { a: 'b', b: 'a' },
    explanation: doc('ANSWER-5'),
  },
  {
    type: 'numeric',
    stem: doc('Q'),
    value: 987654,
    tolerance: 0.5,
    unit: { en: 'm' },
    explanation: doc('ANSWER-6'),
  },
  { type: 'subjective', stem: doc('Q'), modelAnswer: doc('ANSWER-7'), explanation: null },
];

describe('splitQuestion', () => {
  it.each(samples.map((s) => [s.type, s] as const))(
    'keeps the %s answer out of the question part',
    (_, sample) => {
      const { question, answer } = splitQuestion(sample);
      const q = JSON.stringify(question);
      expect(q).not.toMatch(
        /ANSWER-\d|987654|correctOptionId|correctOptionIds|"correct"|accepted|pairs|modelAnswer|tolerance/,
      );
      expect(question.type).toBe(sample.type);
      expect(answer.type).toBe(sample.type);
      expect(JSON.stringify(answer)).toMatch(/ANSWER-\d|987654|"correct":true|"pairs"/);
    },
  );

  it('keeps blank ids and the unit, which the student needs to answer', () => {
    expect(splitQuestion(samples[3]!).question).toMatchObject({ blanks: [{ id: 'b1' }] });
    expect(splitQuestion(samples[5]!).question).toMatchObject({ unit: { en: 'm' } });
  });
});

describe('mediaIdsIn', () => {
  it('finds image ids at any depth', () => {
    const id = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';
    const tree = {
      en: {
        type: 'doc',
        content: [
          { type: 'image', attrs: { mediaId: id } },
          { type: 'text', text: 'x' },
        ],
      },
    };
    expect([...mediaIdsIn([{ question: { stem: tree } }])]).toEqual([id]);
  });
});
