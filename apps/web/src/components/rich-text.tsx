import type { ReactNode } from 'react';
import type { RichNode } from '@/lib/types';

type Media = Record<string, { url: string; variants: Record<string, string> }>;

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

function marked(text: string, marks: RichNode['marks'], key: number): ReactNode {
  let node: ReactNode = text;
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case 'bold':
        node = <strong>{node}</strong>;
        break;
      case 'italic':
        node = <em>{node}</em>;
        break;
      case 'underline':
        node = <u>{node}</u>;
        break;
      case 'strike':
        node = <s>{node}</s>;
        break;
      case 'code':
        node = <code className="rounded-sm bg-surface-muted px-1 text-[0.9em]">{node}</code>;
        break;
      case 'highlight':
        node = <mark className="bg-warning-soft">{node}</mark>;
        break;
      case 'subscript':
        node = <sub>{node}</sub>;
        break;
      case 'superscript':
        node = <sup>{node}</sup>;
        break;
      case 'link': {
        const href = typeof mark.attrs?.['href'] === 'string' ? mark.attrs['href'] : '';
        if (SAFE_LINK.test(href)) {
          node = (
            <a href={href} className="text-link underline" rel="noopener noreferrer nofollow" target="_blank">
              {node}
            </a>
          );
        }
        break;
      }
    }
  }
  return <span key={key}>{node}</span>;
}

function render(node: RichNode, media: Media, key: number): ReactNode {
  const children = (node.content ?? []).map((c, i) => render(c, media, i));
  const align = node.attrs?.['textAlign'];
  const style =
    typeof align === 'string' && align !== 'left'
      ? { textAlign: align as 'center' | 'right' | 'justify' }
      : undefined;
  switch (node.type) {
    case 'doc':
      return <>{children}</>;
    case 'text':
      return marked(node.text ?? '', node.marks, key);
    case 'paragraph':
      return (
        <p key={key} style={style} className="my-3">
          {children}
        </p>
      );
    case 'heading': {
      const level = Number(node.attrs?.['level'] ?? 2);
      const cls = 'mt-6 mb-2 font-semibold text-text';
      if (level <= 2)
        return (
          <h2 key={key} className={`${cls} text-xl`} style={style}>
            {children}
          </h2>
        );
      if (level === 3)
        return (
          <h3 key={key} className={`${cls} text-lg`} style={style}>
            {children}
          </h3>
        );
      return (
        <h4 key={key} className={`${cls} text-base`} style={style}>
          {children}
        </h4>
      );
    }
    case 'bulletList':
      return (
        <ul key={key} className="my-3 list-disc ps-6">
          {children}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key} className="my-3 list-decimal ps-6" start={Number(node.attrs?.['start'] ?? 1)}>
          {children}
        </ol>
      );
    case 'listItem':
      return <li key={key}>{children}</li>;
    case 'blockquote':
      return (
        <blockquote key={key} className="my-3 border-s-4 border-border-strong ps-4 text-text-secondary">
          {children}
        </blockquote>
      );
    case 'codeBlock':
      return (
        <pre key={key} className="my-3 overflow-x-auto rounded-md bg-surface-muted p-3 text-sm">
          <code>{children}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr key={key} className="my-6 border-border" />;
    case 'hardBreak':
      return <br key={key} />;
    case 'image': {
      const id = node.attrs?.['mediaId'];
      const m = typeof id === 'string' ? media[id] : undefined;
      if (!m) return null;
      const alt = typeof node.attrs?.['alt'] === 'string' ? node.attrs['alt'] : '';
      // CMS images come already resized: the smallest variant at least 960 px wide (as in the CMS).
      const src =
        Object.entries(m.variants)
          .map(([k, url]) => ({ width: Number(k.replace(/\D/g, '')), url }))
          .filter((v) => v.width >= 960)
          .sort((a, b) => a.width - b.width)[0]?.url ?? m.url;
      return (
        <img key={key} src={src} alt={alt} className="my-4 h-auto max-w-full rounded-md" loading="lazy" />
      );
    }
    case 'table':
      return (
        <div key={key} className="my-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>{children}</tbody>
          </table>
        </div>
      );
    case 'tableRow':
      return <tr key={key}>{children}</tr>;
    case 'tableHeader':
      return (
        <th key={key} className="border border-border bg-surface-muted p-2 text-start">
          {children}
        </th>
      );
    case 'tableCell':
      return (
        <td key={key} className="border border-border p-2">
          {children}
        </td>
      );
    default:
      // Anything outside the CMS allow-list is not shown (the API refuses it on save anyway).
      return null;
  }
}

/** CMS rich text (TipTap JSON, validated by the API's allow-list) as HTML — no raw HTML is ever injected. */
export function RichText({ doc, media = {} }: { doc: RichNode | undefined; media?: Media }) {
  if (!doc) return null;
  return <div className="text-[15px] leading-7 text-text">{render(doc, media, 0)}</div>;
}
