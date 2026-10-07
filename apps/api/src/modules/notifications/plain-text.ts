import type { LocalizedText } from '@tk/contracts';

type Node = { type?: string; text?: string; content?: Node[] };
const BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock', 'tableRow']);

/** The words of a rich-text document (TipTap JSON), paragraphs on separate lines — for push and email. */
export function plainText(doc: unknown): string {
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.type === 'text' && node.text) out.push(node.text);
    if (node.type === 'hardBreak') out.push('\n');
    for (const child of node.content ?? []) walk(child);
    if (node.type && BLOCKS.has(node.type)) out.push('\n');
  };
  if (doc && typeof doc === 'object') walk(doc as Node);
  return out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Each language's plain text of a localized rich document. */
export function plainLocalized(doc: Partial<Record<'en' | 'ne', unknown>> | null | undefined): LocalizedText {
  const result: Record<string, string> = {};
  for (const lang of ['en', 'ne'] as const) {
    const text = doc?.[lang] ? plainText(doc[lang]) : '';
    if (text) result[lang] = text;
  }
  return result as LocalizedText;
}

/** Shortened to `max` characters on a word boundary, with an ellipsis. */
export function shorten(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20))}…`;
}
