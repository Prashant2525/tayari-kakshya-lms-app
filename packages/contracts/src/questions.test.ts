import { describe, expect, it } from 'vitest';
import { QuestionContent, QuestionInput } from './questions.js';
import { richDocText } from './rich-text.js';

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const loc = (text: string) => ({ en: doc(text) });
const choices = (...ids: string[]) => ids.map((id) => ({ id, content: loc(`Option ${id}`) }));
const issues = (value: unknown) => {
  const r = QuestionContent.safeParse(value);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe('question content', () => {
  it('accepts every question type in its valid form', () => {
    const valid = [
      { type: 'single_choice', stem: loc('Capital?'), options: choices('a', 'b'), correctOptionId: 'b' },
      {
        type: 'multiple_choice',
        stem: loc('Primes?'),
        options: choices('a', 'b', 'c'),
        correctOptionIds: ['a', 'c'],
      },
      { type: 'true_false', stem: loc('Nepal is landlocked.'), correct: true },
      {
        type: 'fill_blank',
        stem: { en: doc('The capital is [[b1]].'), ne: doc('राजधानी [[b1]] हो।') },
        blanks: [{ id: 'b1', accepted: ['Kathmandu'] }],
      },
      {
        type: 'match',
        stem: loc('Match.'),
        left: choices('l1', 'l2'),
        right: choices('r1', 'r2', 'r3'),
        pairs: { l1: 'r2', l2: 'r1' },
      },
      { type: 'numeric', stem: loc('2 + 2?'), value: 4 },
      { type: 'subjective', stem: loc('Explain federalism.'), modelAnswer: loc('Model answer') },
    ];
    for (const q of valid) expect(issues(q), q.type).toEqual([]);
    const parsed = QuestionContent.parse(valid[3]);
    expect(parsed.type === 'fill_blank' && parsed.blanks[0]?.caseSensitive).toBe(false);
  });

  it('rejects answer keys that do not match the question', () => {
    expect(
      issues({ type: 'single_choice', stem: loc('Q'), options: choices('a', 'b'), correctOptionId: 'z' }),
    ).toContain('The correct answer must be one of the options');
    expect(
      issues({ type: 'single_choice', stem: loc('Q'), options: choices('a', 'a'), correctOptionId: 'a' }),
    ).toContain('Ids must be unique');
    expect(
      issues({
        type: 'match',
        stem: loc('Q'),
        left: choices('l1', 'l2'),
        right: choices('r1', 'r2'),
        pairs: { l1: 'r1' },
      }),
    ).toContain('Every left item needs a matching right item');
    expect(
      issues({
        type: 'fill_blank',
        stem: loc('No placeholder here'),
        blanks: [{ id: 'b1', accepted: ['x'] }],
      }),
    ).toContain('Put [[b1]] in the question where the blank goes');
    expect(issues({ type: 'numeric', stem: loc('Q'), value: 1, tolerance: -1 }).length).toBeGreaterThan(0);
    expect(issues({ type: 'subjective', stem: loc('Q') }).length).toBeGreaterThan(0);
  });

  it('rejects unsafe rich text inside options', () => {
    const bad = {
      type: 'single_choice',
      stem: loc('Q'),
      options: [
        { id: 'a', content: { en: { type: 'doc', content: [{ type: 'script', text: 'x' }] } } },
        { id: 'b', content: loc('B') },
      ],
      correctOptionId: 'a',
    };
    expect(issues(bad).length).toBeGreaterThan(0);
  });

  it('validates marks to two decimals and normalises tags', () => {
    const base = {
      subjectId: '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b',
      difficulty: 'easy',
      accessLevel: 'premium',
      content: { type: 'true_false', stem: loc('Q'), correct: true },
    };
    expect(QuestionInput.safeParse({ ...base, defaultMarks: 0.29 }).success).toBe(true);
    expect(QuestionInput.safeParse({ ...base, defaultMarks: 0.255 }).success).toBe(false);
    const parsed = QuestionInput.parse({ ...base, defaultMarks: 1, tags: ['  current   affairs '] });
    expect(parsed.tags).toEqual(['current affairs']);
    expect(parsed.defaultNegativeMarks).toBe(0);
  });

  it('extracts plain text from rich text', () => {
    expect(
      richDocText({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Line one' },
              { type: 'hardBreak' },
              { type: 'text', text: 'two' },
            ],
          },
          { type: 'paragraph', content: [{ type: 'text', text: 'Next' }] },
        ],
      }),
    ).toBe('Line one\ntwo\nNext');
  });
});
