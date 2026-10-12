import { LocalizedRichDoc } from '@tk/contracts';
import { describe, expect, it } from 'vitest';
import { inline, md, plainText } from './markdown.ts';

describe('content-pack Markdown', () => {
  it('turns inline marks into rich-text marks', () => {
    expect(inline('Water is H~2~O, **very *common* here**, use `ls`.')).toEqual([
      { type: 'text', text: 'Water is H' },
      { type: 'text', text: '2', marks: [{ type: 'subscript' }] },
      { type: 'text', text: 'O, ' },
      { type: 'text', text: 'very ', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'common', marks: [{ type: 'bold' }, { type: 'italic' }] },
      { type: 'text', text: ' here', marks: [{ type: 'bold' }] },
      { type: 'text', text: ', use ' },
      { type: 'text', text: 'ls', marks: [{ type: 'code' }] },
      { type: 'text', text: '.' },
    ]);
    // A lone marker stays text; a backslash escapes one.
    expect(inline('2 * 3 and a \\*star\\*')).toEqual([{ type: 'text', text: '2 * 3 and a *star*' }]);
  });

  it('builds headings, lists, tables, quotes, code and rules', () => {
    const doc = md(
      [
        '## Title',
        'First line',
        'continues here.',
        '',
        '- one',
        '- two',
        '  wraps',
        '',
        '3. third',
        '4. fourth',
        '',
        '| A | B |',
        '|---|---|',
        '| 1 | 2 |',
        '',
        '> Remember this.',
        '',
        '```python',
        'print(1)',
        '```',
        '---',
      ].join('\n'),
    );
    expect(doc.content.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'bulletList',
      'orderedList',
      'table',
      'blockquote',
      'codeBlock',
      'horizontalRule',
    ]);
    expect(plainText(doc.content[1]!)).toBe('First line continues here.');
    expect(plainText(doc.content[2]!)).toBe('one two wraps');
    expect(doc.content[3]!.attrs).toEqual({ start: 3 });
    expect(doc.content[4]!.content).toHaveLength(2);
    expect(doc.content[6]!.attrs).toEqual({ language: 'python' });
    // What the CMS stores is accepted by its validator.
    expect(LocalizedRichDoc.safeParse({ en: doc }).success).toBe(true);
  });
});
