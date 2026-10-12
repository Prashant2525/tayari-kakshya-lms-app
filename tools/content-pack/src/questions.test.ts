import type { QuestionContent } from '@tk/contracts';
import { describe, expect, it } from 'vitest';
import { plainText, type Doc } from './markdown.ts';
import { courses } from './pack.ts';
import { match, mcq, multi, scrambledOrder } from './questions.ts';

const text = (c: { en?: unknown }) => plainText(c.en as Doc);
const content = (q: { content: unknown }) => q.content as QuestionContent;

describe('answer positions (Phase 16)', () => {
  it('scrambles choices but keeps the intended answer correct', () => {
    const q = mcq('Which is the kernel?', ['Shell', 'Kernel', 'Compiler', 'Editor'], 1, 'Because.');
    const c = content(q);
    if (c.type !== 'single_choice') throw new Error('type');
    const right = c.options.find((o) => o.id === c.correctOptionId)!;
    expect(text(right.content)).toBe('Kernel');
    // Same text → same order on every import.
    expect(mcq('Which is the kernel?', ['Shell', 'Kernel', 'Compiler', 'Editor'], 1, 'Because.')).toEqual(q);

    const m = multi('Pick the even numbers', ['1', '2', '3', '4', '6'], [1, 3, 4], 'Even.');
    const mc = content(m);
    if (mc.type !== 'multiple_choice') throw new Error('type');
    const picked = mc.options.filter((o) => mc.correctOptionIds.includes(o.id)).map((o) => text(o.content));
    expect(picked.sort()).toEqual(['2', '4', '6']);
  });

  it('pairs each left item with its own right item, whatever the stored order', () => {
    const pairs: Array<[string, string]> = [
      ['CPU', 'Executes instructions'],
      ['RAM', 'Holds running programs'],
      ['Disk', 'Keeps files'],
      ['NIC', 'Connects to the network'],
    ];
    const q = match('Match the part to its job', pairs, 'Parts.', 'medium', ['Prints pages']);
    const c = content(q);
    if (c.type !== 'match') throw new Error('type');
    const { left, right, pairs: answer } = c;
    for (const [i, [, job]] of pairs.entries()) {
      const r = right.find((x) => x.id === answer[left[i]!.id])!;
      expect(text(r.content)).toBe(job);
    }
    expect(right.map((r) => text(r.content))).not.toEqual([...pairs.map(([, j]) => j), 'Prints pages']);
  });

  it('is a permutation', () => {
    for (const n of [2, 3, 5, 10])
      expect([...scrambledOrder('seed', n)].sort()).toEqual([...Array(n).keys()]);
  });

  it('leaves no answer position a giveaway across the pack', () => {
    const counts = new Map<string, number>();
    let single = 0;
    let identityMatches = 0;
    let matches = 0;
    for (const course of courses)
      for (const chapter of course.chapters)
        for (const topic of chapter.topics)
          for (const q of topic.questions) {
            if (q.content.type === 'single_choice') {
              single++;
              const id = String(q.content['correctOptionId']);
              counts.set(id, (counts.get(id) ?? 0) + 1);
            }
            if (q.content.type === 'match') {
              matches++;
              if (
                Object.entries(q.content.pairs as Record<string, string>).every(
                  ([l, r]) => l.slice(1) === r.slice(1),
                )
              )
                identityMatches++;
            }
          }
    expect(single).toBeGreaterThan(50);
    for (const [id, n] of counts) expect(n / single, `share of answer ${id}`).toBeLessThan(0.4);
    expect(identityMatches, 'match questions stored in answer order').toBeLessThanOrEqual(matches * 0.1);
  });
});
