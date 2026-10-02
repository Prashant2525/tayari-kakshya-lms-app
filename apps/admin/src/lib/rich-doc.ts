/**
 * Converts editor JSON (TipTap) into the stored rich-text shape the API accepts (`validateRichDoc`):
 * drops attributes the allow-list does not know or that are empty, and empty text nodes.
 * Unknown node or mark types are kept so the server can reject them visibly instead of losing content silently.
 */
export interface JsonNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: JsonNode[];
}

const NODE_ATTRS: Record<string, readonly string[]> = {
  heading: ['level', 'textAlign'],
  paragraph: ['textAlign'],
  orderedList: ['start'],
  codeBlock: ['language'],
  image: ['mediaId', 'alt'],
  tableCell: ['colspan', 'rowspan', 'colwidth', 'textAlign'],
  tableHeader: ['colspan', 'rowspan', 'colwidth', 'textAlign'],
};
const MARK_ATTRS: Record<string, readonly string[]> = {
  link: ['href', 'target', 'rel'],
  highlight: ['color'],
};

function pick(attrs: Record<string, unknown> | undefined, keys: readonly string[] | undefined) {
  if (!attrs || !keys) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = attrs[key];
    if (value === null || value === undefined || value === '') continue;
    // Default alignment and the default list start add nothing.
    if (key === 'textAlign' && value === 'left') continue;
    if (key === 'start' && value === 1) continue;
    out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function clean(node: JsonNode): JsonNode | null {
  if (node.type === 'text') {
    if (!node.text) return null;
    const marks = node.marks?.map((m) => {
      const attrs = pick(m.attrs, MARK_ATTRS[m.type]);
      return attrs ? { type: m.type, attrs } : { type: m.type };
    });
    return { type: 'text', text: node.text, ...(marks?.length ? { marks } : {}) };
  }
  const out: JsonNode = { type: node.type };
  const attrs = pick(node.attrs, node.type ? NODE_ATTRS[node.type] : undefined);
  if (attrs) out.attrs = attrs;
  if (node.content) {
    const content = node.content.map(clean).filter((c): c is JsonNode => c !== null);
    out.content = content;
  }
  return out;
}

export function toStoredDoc(doc: JsonNode): JsonNode {
  return clean(doc) ?? { type: 'doc', content: [] };
}

/** True when a document has no text, images or tables (e.g. a single empty paragraph). */
export function isEmptyDoc(doc: JsonNode | null | undefined): boolean {
  if (!doc) return true;
  const hasContent = (n: JsonNode): boolean =>
    (n.type === 'text' && Boolean(n.text?.trim())) ||
    n.type === 'image' ||
    n.type === 'table' ||
    n.type === 'horizontalRule' ||
    Boolean(n.content?.some(hasContent));
  return !hasContent(doc);
}
