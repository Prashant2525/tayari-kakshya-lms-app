import { QuestionInput, type QuestionContent } from '@tk/contracts';
import { describe, expect, it } from 'vitest';
import {
  blanksInStem,
  draftFromDetail,
  draftToInput,
  emptyDraft,
  nextId,
  validateDraft,
  type QuestionDetail,
} from './questions';

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const loc = (text: string) => ({ en: doc(text) });
const SUBJECT = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';

function detail(content: QuestionContent): QuestionDetail {
  return {
    id: 'q1',
    type: content.type,
    subject: { id: SUBJECT, name: { en: 'GK' } },
    topic: null,
    group: null,
    difficulty: 'hard',
    defaultMarks: 2,
    defaultNegativeMarks: 0.4,
    language: 'both',
    accessLevel: 'free',
    isPyq: true,
    status: 'draft',
    tags: ['rights'],
    sources: [{ examNodeId: null, paperId: null, yearBs: 2079, note: 'Paper I' }],
    content,
    versionNo: 1,
    versionCount: 1,
    openReports: 0,
    updatedAt: '2026-10-03T00:00:00.000Z',
  };
}

const CONTENTS: QuestionContent[] = [
  {
    type: 'single_choice',
    stem: loc('Q'),
    options: [
      { id: 'a', content: loc('A') },
      { id: 'b', content: { en: doc('B'), ne: doc('ख') } },
    ],
    correctOptionId: 'b',
    explanation: loc('Because'),
  },
  {
    type: 'multiple_choice',
    stem: loc('Q'),
    options: [
      { id: 'a', content: loc('A') },
      { id: 'b', content: loc('B') },
      { id: 'c', content: loc('C') },
    ],
    correctOptionIds: ['a', 'c'],
    explanation: null,
  },
  { type: 'true_false', stem: loc('Q'), correct: false, explanation: null },
  {
    type: 'fill_blank',
    stem: loc('Capital is [[b1]] and river [[b2]].'),
    blanks: [
      { id: 'b1', accepted: ['Kathmandu', 'काठमाडौं'], caseSensitive: false },
      { id: 'b2', accepted: ['Koshi'], caseSensitive: true },
    ],
    explanation: null,
  },
  {
    type: 'match',
    stem: loc('Match'),
    left: [
      { id: 'l1', content: loc('L1') },
      { id: 'l2', content: loc('L2') },
    ],
    right: [
      { id: 'r1', content: loc('R1') },
      { id: 'r2', content: loc('R2') },
      { id: 'r3', content: loc('R3') },
    ],
    pairs: { l1: 'r2', l2: 'r1' },
    explanation: null,
  },
  { type: 'numeric', stem: loc('g?'), value: 9.8, tolerance: 0.05, unit: { en: 'm/s²' }, explanation: null },
  { type: 'subjective', stem: loc('Explain'), modelAnswer: loc('Model'), explanation: null },
];

describe('question editor conversion', () => {
  it.each(CONTENTS.map((c) => [c.type, c] as const))(
    'round-trips %s through the editor unchanged',
    (_type, content) => {
      const draft = draftFromDetail(detail(content));
      const input = QuestionInput.parse(draftToInput(content.type, draft));
      expect(input.content).toEqual(content);
      expect(input).toMatchObject({
        subjectId: SUBJECT,
        difficulty: 'hard',
        defaultMarks: 2,
        defaultNegativeMarks: 0.4,
        accessLevel: 'free',
        tags: ['rights'],
        sources: [{ examNodeId: null, paperId: null, yearBs: 2079, note: 'Paper I' }],
      });
      expect(validateDraft(content.type, draft)).toEqual([]);
    },
  );

  it('explains what is missing in a blank question', () => {
    const problems = validateDraft('single_choice', emptyDraft('single_choice'));
    expect(problems).toContain('Subject: Choose a subject');
    expect(problems.some((p) => p.startsWith('Question:'))).toBe(true);
    expect(problems.some((p) => p.startsWith('Correct answer') || p.startsWith('Options'))).toBe(true);
  });

  it('rejects negative marks above the marks', () => {
    const d = draftFromDetail(detail(CONTENTS[0] as QuestionContent));
    d.negativeMarks = '3';
    expect(validateDraft('single_choice', d)).toEqual(['Negative marks: cannot be more than the marks']);
  });

  it('finds blank placeholders and the next free ids', () => {
    expect(blanksInStem({ en: doc('A [[b1]] B [[b3]] [[b1]]') as never, ne: null })).toEqual(['b1', 'b3']);
    expect(nextId(['a', 'b', 'd'], 'letter')).toBe('c');
    expect(nextId(['b1', 'b3'], 'b')).toBe('b2');
    expect(nextId([], 'l')).toBe('l1');
  });
});
