import { describe, expect, it } from 'vitest';
import { LocalizedRichDoc, richDocMediaIds, validateRichDoc } from './rich-text.js';

const MEDIA_ID = '0199b6a2-1c2d-7e3f-8a4b-5c6d7e8f9a0b';
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (t: string, marks?: unknown[]) => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });

describe('rich text allow-list', () => {
  it('accepts typical study notes (headings, lists, tables, images, safe links)', () => {
    const valid = doc(
      { type: 'heading', attrs: { level: 2 }, content: [text('व्याकरण')] },
      p(
        text('Read '),
        text('Article 1', [{ type: 'link', attrs: { href: 'https://lawcommission.gov.np' } }]),
      ),
      { type: 'bulletList', content: [{ type: 'listItem', content: [p(text('one', [{ type: 'bold' }]))] }] },
      { type: 'image', attrs: { mediaId: MEDIA_ID, alt: 'diagram' } },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [{ type: 'tableHeader', attrs: { colspan: 1 }, content: [p(text('A'))] }],
          },
        ],
      },
    );
    expect(validateRichDoc(valid)).toEqual([]);
    expect(richDocMediaIds(valid)).toEqual([MEDIA_ID]);
  });

  it.each([
    ['javascript: links', p(text('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]))],
    ['data: links', p(text('x', [{ type: 'link', attrs: { href: 'data:text/html,<script>' } }]))],
    ['unknown nodes (raw HTML)', { type: 'html', content: [text('<script>alert(1)</script>')] }],
    ['event-handler attributes', { type: 'paragraph', attrs: { onclick: 'alert(1)' }, content: [text('x')] }],
    ['images by arbitrary URL', { type: 'image', attrs: { src: 'https://evil.example/x.png' } }],
    ['style attributes on marks', p(text('x', [{ type: 'bold', attrs: { style: 'background:url(x)' } }]))],
    ['unknown marks', p(text('x', [{ type: 'script' }]))],
    ['invalid heading levels', { type: 'heading', attrs: { level: 9 }, content: [text('x')] }],
  ])('rejects %s', (_label, node) => {
    expect(validateRichDoc(doc(node)).length).toBeGreaterThan(0);
  });

  it('rejects documents that are not a doc root or are excessively deep', () => {
    expect(validateRichDoc({ type: 'paragraph' })).not.toEqual([]);
    let deep: unknown = text('x');
    for (let i = 0; i < 30; i++) deep = { type: 'blockquote', content: [deep] };
    expect(validateRichDoc(doc(deep)).join(' ')).toMatch(/too deep/);
  });

  it('requires at least one language in localized content', () => {
    expect(LocalizedRichDoc.safeParse({ en: doc(p(text('hi'))) }).success).toBe(true);
    expect(LocalizedRichDoc.safeParse({}).success).toBe(false);
    expect(LocalizedRichDoc.safeParse({ en: doc({ type: 'iframe' }) }).success).toBe(false);
  });
});
