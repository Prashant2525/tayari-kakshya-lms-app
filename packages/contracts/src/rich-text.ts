import { z } from 'zod';

/**
 * Rich text is stored as TipTap/ProseMirror JSON (never raw HTML). This validator is an allow-list:
 * unknown node types, marks or attributes are rejected, links must be http(s)/mailto, and images reference
 * media-library assets by id (the API resolves URLs), so stored content cannot carry script injection.
 */
export const RICH_TEXT_LIMITS = { maxDepth: 20, maxNodes: 20_000, maxTextLength: 200_000 } as const;

const BLOCK_NODES = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'hardBreak',
  'image',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'text',
]);
const MARKS = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'link',
  'highlight',
  'subscript',
  'superscript',
]);
const SAFE_LINK = /^(https?:\/\/|mailto:)/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Node {
  type?: unknown;
  text?: unknown;
  attrs?: unknown;
  marks?: unknown;
  content?: unknown;
}

function checkAttrs(type: string, attrs: unknown, path: string, issues: string[]): void {
  if (attrs === undefined || attrs === null) return;
  if (typeof attrs !== 'object' || Array.isArray(attrs)) {
    issues.push(`${path}: attrs must be an object`);
    return;
  }
  const a = attrs as Record<string, unknown>;
  const allowed: Record<string, (v: unknown) => boolean> = {
    level: (v) => type === 'heading' && Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 4,
    start: (v) => type === 'orderedList' && Number.isInteger(v) && (v as number) >= 0,
    language: (v) =>
      type === 'codeBlock' && (v === null || (typeof v === 'string' && /^[a-z0-9+#-]{0,20}$/i.test(v))),
    mediaId: (v) => type === 'image' && typeof v === 'string' && UUID.test(v),
    alt: (v) => type === 'image' && (v === null || (typeof v === 'string' && v.length <= 300)),
    colspan: (v) =>
      /^table(Cell|Header)$/.test(type) && Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 20,
    rowspan: (v) =>
      /^table(Cell|Header)$/.test(type) && Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 50,
    colwidth: (v) => /^table(Cell|Header)$/.test(type) && (v === null || Array.isArray(v)),
    textAlign: (v) => v === null || v === 'left' || v === 'center' || v === 'right' || v === 'justify',
  };
  for (const [key, value] of Object.entries(a)) {
    const ok = allowed[key];
    if (!ok || !ok(value)) issues.push(`${path}: attribute "${key}" is not allowed`);
  }
  if (type === 'image' && typeof a['mediaId'] !== 'string') issues.push(`${path}: image needs a mediaId`);
}

function checkMarks(marks: unknown, path: string, issues: string[]): void {
  if (marks === undefined) return;
  if (!Array.isArray(marks)) {
    issues.push(`${path}: marks must be an array`);
    return;
  }
  marks.forEach((m: unknown, i) => {
    const mark = m as { type?: unknown; attrs?: Record<string, unknown> };
    if (typeof mark?.type !== 'string' || !MARKS.has(mark.type)) {
      issues.push(`${path}.marks[${i}]: mark "${String(mark?.type)}" is not allowed`);
      return;
    }
    if (mark.type === 'link') {
      const href = mark.attrs?.['href'];
      if (typeof href !== 'string' || !SAFE_LINK.test(href) || href.length > 2000) {
        issues.push(`${path}.marks[${i}]: links must start with http://, https:// or mailto:`);
      }
      const extra = Object.keys(mark.attrs ?? {}).filter(
        (k) => !['href', 'target', 'rel', 'class'].includes(k),
      );
      if (extra.length) issues.push(`${path}.marks[${i}]: link attribute(s) ${extra.join(', ')} not allowed`);
    } else if (mark.attrs && Object.keys(mark.attrs).length > 0 && mark.type !== 'highlight') {
      issues.push(`${path}.marks[${i}]: mark attributes are not allowed`);
    }
  });
}

/** Returns a list of problems (empty = valid). Exported for unit tests and server-side checks. */
export function validateRichDoc(doc: unknown): string[] {
  const issues: string[] = [];
  let nodes = 0;
  let textLength = 0;
  const root = doc as Node;
  if (!root || typeof root !== 'object' || root.type !== 'doc' || !Array.isArray(root.content)) {
    return ['Document must be { type: "doc", content: [...] }'];
  }
  const walk = (node: Node, path: string, depth: number) => {
    if (issues.length > 20) return;
    nodes += 1;
    if (depth > RICH_TEXT_LIMITS.maxDepth) {
      issues.push(`${path}: nesting is too deep`);
      return;
    }
    if (typeof node?.type !== 'string' || !BLOCK_NODES.has(node.type)) {
      issues.push(`${path}: node type "${String(node?.type)}" is not allowed`);
      return;
    }
    const allowedKeys = ['type', 'text', 'attrs', 'marks', 'content'];
    const extra = Object.keys(node).filter((k) => !allowedKeys.includes(k));
    if (extra.length) issues.push(`${path}: unexpected key(s) ${extra.join(', ')}`);
    if (node.type === 'text') {
      if (typeof node.text !== 'string' || node.text.length === 0)
        issues.push(`${path}: text must be a non-empty string`);
      else textLength += node.text.length;
      checkMarks(node.marks, path, issues);
      if (node.content !== undefined) issues.push(`${path}: text nodes cannot have content`);
      return;
    }
    if (node.marks !== undefined) issues.push(`${path}: only text nodes can have marks`);
    checkAttrs(node.type, node.attrs, path, issues);
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) issues.push(`${path}: content must be an array`);
      else node.content.forEach((child, i) => walk(child as Node, `${path}.content[${i}]`, depth + 1));
    }
  };
  root.content.forEach((child, i) => walk(child as Node, `content[${i}]`, 1));
  if (nodes > RICH_TEXT_LIMITS.maxNodes) issues.push('Document has too many elements');
  if (textLength > RICH_TEXT_LIMITS.maxTextLength) issues.push('Document text is too long');
  return issues;
}

export const RichDoc = z.custom<Record<string, unknown>>((value) => validateRichDoc(value).length === 0, {
  message: 'Rich text contains unsupported or unsafe content',
});

/** Localized rich text { en?, ne? } — at least one language. */
export const LocalizedRichDoc = z
  .object({ en: RichDoc.optional(), ne: RichDoc.optional() })
  .strict()
  .refine((v) => Boolean(v.en ?? v.ne), { message: 'Provide the content in English, Nepali or both' });
export type LocalizedRichDoc = z.infer<typeof LocalizedRichDoc>;

/** Media ids referenced by image nodes (the API checks they exist and are public). */
export function richDocMediaIds(doc: unknown): string[] {
  const ids = new Set<string>();
  const walk = (node: Node) => {
    if (node?.type === 'image') {
      const id = (node.attrs as Record<string, unknown> | undefined)?.['mediaId'];
      if (typeof id === 'string') ids.add(id);
    }
    if (Array.isArray(node?.content)) node.content.forEach((c) => walk(c as Node));
  };
  walk(doc as Node);
  return [...ids];
}

/** Plain text of a document (text nodes joined; blocks separated by newlines). For search and placeholder checks. */
export function richDocText(doc: unknown): string {
  const out: string[] = [];
  const walk = (node: Node, block: boolean) => {
    if (node?.type === 'text' && typeof node.text === 'string') out.push(node.text);
    if (node?.type === 'hardBreak') out.push('\n');
    if (Array.isArray(node?.content)) node.content.forEach((c) => walk(c as Node, false));
    if (block) out.push('\n');
  };
  const root = doc as Node;
  if (Array.isArray(root?.content)) root.content.forEach((c) => walk(c as Node, true));
  return out.join('').trim();
}
