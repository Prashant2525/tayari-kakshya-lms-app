import type { QuestionContent } from '@tk/contracts';
import { scoreQuestion, type AnswerKey, type AnswerResponse } from '@tk/domain';
import { describe, expect, it } from 'vitest';
import { courses } from './pack.ts';

/**
 * Phase 16: every objective question in the pack is answerable — its own answer key, scored by the real scoring
 * engine, earns full marks, and a different answer does not. Catches keys that point at a missing option, blanks
 * missing from the text, impossible numeric answers and broken match pairs.
 */
const scheme = { marks: 100, negativeMarks: 0 };
const rules = {
  multipleChoice: 'all_or_nothing',
  match: 'all_or_nothing',
  fillBlank: 'all_or_nothing',
} as const;

function keyAndAnswer(
  c: QuestionContent,
): { key: AnswerKey; right: AnswerResponse; wrong: AnswerResponse } | null {
  switch (c.type) {
    case 'single_choice': {
      expect(c.options.map((o) => o.id)).toContain(c.correctOptionId);
      const other = c.options.find((o) => o.id !== c.correctOptionId)!.id;
      return {
        key: c,
        right: { type: 'single_choice', optionId: c.correctOptionId },
        wrong: { type: 'single_choice', optionId: other },
      };
    }
    case 'multiple_choice': {
      for (const id of c.correctOptionIds) expect(c.options.map((o) => o.id)).toContain(id);
      return {
        key: c,
        right: { type: 'multiple_choice', optionIds: c.correctOptionIds },
        // All options, or (when every option is correct) all but one.
        wrong: {
          type: 'multiple_choice',
          optionIds:
            c.correctOptionIds.length === c.options.length
              ? c.correctOptionIds.slice(1)
              : c.options.map((o) => o.id),
        },
      };
    }
    case 'true_false':
      return {
        key: c,
        right: { type: 'true_false', value: c.correct },
        wrong: { type: 'true_false', value: !c.correct },
      };
    case 'fill_blank': {
      const stem = JSON.stringify(c.stem);
      for (const b of c.blanks) {
        expect(stem, `blank ${b.id} is in the text`).toContain(`[[${b.id}]]`);
        expect(b.accepted.length).toBeGreaterThan(0);
      }
      return {
        key: c,
        right: {
          type: 'fill_blank',
          blanks: Object.fromEntries(c.blanks.map((b) => [b.id, b.accepted[0]!])),
        },
        wrong: { type: 'fill_blank', blanks: Object.fromEntries(c.blanks.map((b) => [b.id, 'zzz-not-it'])) },
      };
    }
    case 'match': {
      for (const [l, r] of Object.entries(c.pairs)) {
        expect(c.left.map((x) => x.id)).toContain(l);
        expect(c.right.map((x) => x.id)).toContain(r);
      }
      const ids = Object.keys(c.pairs);
      const rotated = Object.fromEntries(ids.map((l, i) => [l, c.pairs[ids[(i + 1) % ids.length]!]!]));
      return { key: c, right: { type: 'match', pairs: c.pairs }, wrong: { type: 'match', pairs: rotated } };
    }
    case 'numeric':
      return {
        key: c,
        right: { type: 'numeric', value: c.value },
        wrong: { type: 'numeric', value: c.value + Math.max(1, c.tolerance * 10 + 1) },
      };
    default:
      return null;
  }
}

describe('answer keys (Phase 16)', () => {
  for (const course of courses) {
    it(`${course.slug}: every objective question scores full marks with its own key, and not with another answer`, () => {
      let checked = 0;
      for (const chapter of course.chapters)
        for (const topic of chapter.topics)
          for (const [n, q] of topic.questions.entries()) {
            const where = `${topic.key} question ${n + 1}`;
            const set = keyAndAnswer(q.content as unknown as QuestionContent);
            if (!set) continue;
            checked++;
            expect(scoreQuestion(set.key, set.right, scheme, rules), where).toEqual({
              outcome: 'correct',
              awarded: 100,
            });
            expect(scoreQuestion(set.key, set.wrong, scheme, rules).outcome, where).toBe('wrong');
          }
      expect(checked).toBeGreaterThan(10);
    });
  }
});
