/**
 * A small Markdown dialect for writing content packs, turned into the CMS's rich text (TipTap/ProseMirror JSON —
 * the allow-listed nodes and marks of `@tk/contracts` rich-text).
 *
 * Blocks: `## Heading` (level 2; `###` 3, `####` 4), paragraphs (lines joined), `- item` / `1. item` lists,
 * `> quote`, ```` ```lang ```` code blocks, `| a | b |` tables (first row = header; a `|---|` row is skipped) and
 * `---` rules. Inline: `**bold**`, `*italic*`, `` `code` ``, `~sub~` and `^sup^` (e.g. `H~2~O`, `x^2^`).
 */
export interface Mark {
  type: 'bold' | 'italic' | 'code' | 'subscript' | 'superscript';
}
export interface TextNode {
  type: 'text';
  text: string;
  marks?: Mark[];
}
export interface BlockNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Array<BlockNode | TextNode>;
}
export interface Doc {
  type: 'doc';
  content: BlockNode[];
}

const INLINE: Array<{ open: string; close: string; mark: Mark['type'] }> = [
  { open: '**', close: '**', mark: 'bold' },
  { open: '`', close: '`', mark: 'code' },
  { open: '*', close: '*', mark: 'italic' },
  { open: '~', close: '~', mark: 'subscript' },
  { open: '^', close: '^', mark: 'superscript' },
];

/**
 * Where a mark opened at `start` closes, or -1. As in Markdown, a marker opens only before a non-space and closes
 * only after one (so "2 * 3" stays text), and an escaped marker (`\*`) never closes.
 */
function findClose(source: string, token: (typeof INLINE)[number], start: number): number {
  const from = start + token.open.length;
  if (token.mark !== 'code' && /\s/.test(source[from] ?? ' ')) return -1;
  for (let j = from; j < source.length; j += 1) {
    if (source[j] === '\\') {
      j += 1;
      continue;
    }
    if (source.startsWith(token.close, j) && (token.mark === 'code' || !/\s/.test(source[j - 1]!))) return j;
  }
  return -1;
}

/** Inline text with marks. Code is literal; other marks may nest (e.g. a subscript inside bold). */
export function inline(source: string, marks: Mark[] = []): TextNode[] {
  const out: TextNode[] = [];
  let plain = '';
  const flush = () => {
    if (plain)
      out.push(
        marks.length ? { type: 'text', text: plain, marks: [...marks] } : { type: 'text', text: plain },
      );
    plain = '';
  };
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === '\\' && i + 1 < source.length) {
      plain += source[i + 1];
      i += 2;
      continue;
    }
    const token = INLINE.find((t) => source.startsWith(t.open, i));
    if (token) {
      const end = findClose(source, token, i);
      // A lone marker (no closing one, or empty) is just text, e.g. "2 * 3".
      if (end > i + token.open.length) {
        flush();
        const body = source.slice(i + token.open.length, end);
        const nested = [...marks, { type: token.mark }];
        if (token.mark === 'code') out.push({ type: 'text', text: body, marks: nested });
        else out.push(...inline(body, nested));
        i = end + token.close.length;
        continue;
      }
    }
    plain += ch;
    i += 1;
  }
  flush();
  return out;
}

const paragraph = (text: string): BlockNode => {
  const content = inline(text);
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
};

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

/** Markdown (the dialect above) to a rich-text document. */
export function md(source: string): Doc {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: BlockNode[] = [];
  let i = 0;
  const isBlank = (l: string | undefined) => l === undefined || l.trim() === '';
  const startsBlock = (l: string) =>
    /^#{1,4}\s/.test(l) ||
    /^\s*[-*]\s+/.test(l) ||
    /^\s*\d+[.)]\s+/.test(l) ||
    /^>\s?/.test(l) ||
    l.startsWith('```') ||
    /^\s*\|/.test(l) ||
    /^-{3,}\s*$/.test(l);

  while (i < lines.length) {
    const line = lines[i]!;
    if (isBlank(line)) {
      i += 1;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(4, Math.max(2, heading[1]!.length));
      blocks.push({ type: 'heading', attrs: { level }, content: inline(heading[2]!.trim()) });
      i += 1;
      continue;
    }
    if (/^-{3,}\s*$/.test(line)) {
      blocks.push({ type: 'horizontalRule' });
      i += 1;
      continue;
    }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim() || null;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        body.push(lines[i]!);
        i += 1;
      }
      i += 1; // closing fence
      const text = body.join('\n');
      blocks.push({
        type: 'codeBlock',
        attrs: { language },
        ...(text ? { content: [{ type: 'text', text }] } : {}),
      });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        body.push(lines[i]!.replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'blockquote', content: [paragraph(body.join(' ').trim())] });
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) {
        const row = cells(lines[i]!);
        if (!row.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(row);
        i += 1;
      }
      blocks.push({
        type: 'table',
        content: rows.map((row, r) => ({
          type: 'tableRow',
          content: row.map((cell) => ({
            type: r === 0 ? 'tableHeader' : 'tableCell',
            content: [paragraph(cell)],
          })),
        })),
      });
      continue;
    }
    const bullet = /^\s*[-*]\s+/;
    const numbered = /^\s*(\d+)[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const pattern = ordered ? numbered : bullet;
      const start = ordered ? Number(numbered.exec(line)![1]) : 1;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i]!)) {
        let text = lines[i]!.replace(pattern, '');
        i += 1;
        // Indented continuation lines belong to the item.
        while (
          i < lines.length &&
          /^\s{2,}\S/.test(lines[i]!) &&
          !bullet.test(lines[i]!) &&
          !numbered.test(lines[i]!)
        ) {
          text += ' ' + lines[i]!.trim();
          i += 1;
        }
        items.push(text.trim());
      }
      blocks.push({
        type: ordered ? 'orderedList' : 'bulletList',
        ...(ordered && start !== 1 ? { attrs: { start } } : {}),
        content: items.map((t) => ({ type: 'listItem', content: [paragraph(t)] })),
      });
      continue;
    }
    const body: string[] = [];
    while (i < lines.length && !isBlank(lines[i]) && (body.length === 0 || !startsBlock(lines[i]!))) {
      body.push(lines[i]!.trim());
      i += 1;
    }
    blocks.push(paragraph(body.join(' ')));
  }
  return { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] };
}

/** All the text of a document, for counting words and checking characters. */
export function plainText(node: Doc | BlockNode | TextNode): string {
  if (node.type === 'text') return (node as TextNode).text;
  const children = (node as BlockNode).content ?? [];
  return children.map((c) => plainText(c as BlockNode)).join(node.type === 'doc' ? '\n' : ' ');
}
