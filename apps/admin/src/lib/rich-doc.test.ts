import { Editor } from '@tiptap/react';
import { validateRichDoc } from '@tk/contracts';
import { describe, expect, it } from 'vitest';
import { richTextExtensions } from '@/components/content/rich-text-extensions';
import { isEmptyDoc, toStoredDoc, type JsonNode } from './rich-doc';

const MEDIA_ID = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';

/** Real editor output for some HTML, converted to the stored shape. */
function stored(html: string): JsonNode {
  const editor = new Editor({ extensions: richTextExtensions(), content: html });
  const json = editor.getJSON() as JsonNode;
  editor.destroy();
  return toStoredDoc(json);
}

describe('rich text produced by the note editor', () => {
  it('passes the server allow-list for every formatting option the toolbar offers', () => {
    const doc = stored(`
      <h2 style="text-align:center">Articles</h2>
      <p><strong>Bold</strong> <em>italic</em> <u>underline</u> <s>strike</s> <code>code</code>
         <mark>highlight</mark> H<sub>2</sub>O x<sup>2</sup>
         <a href="https://example.com/notes">link</a> <a href="mailto:help@example.com">mail</a></p>
      <ol start="3"><li><p>third</p></li></ol>
      <ul><li><p>bullet</p></li></ul>
      <blockquote><p>quote</p></blockquote>
      <pre><code>const x = 1;</code></pre>
      <hr>
      <p>line<br>break</p>
      <img data-media-id="${MEDIA_ID}" alt="Diagram">
      <table><tr><th><p>Head</p></th></tr><tr><td><p>Cell</p></td></tr></table>
    `);
    expect(validateRichDoc(doc)).toEqual([]);
    const json = JSON.stringify(doc);
    expect(json).toContain('"textAlign":"center"');
    expect(json).toContain('"start":3');
    expect(json).toContain(`"mediaId":"${MEDIA_ID}"`);
    expect(json).toContain('"href":"https://example.com/notes"');
    for (const type of [
      'heading',
      'orderedList',
      'bulletList',
      'blockquote',
      'codeBlock',
      'table',
      'image',
    ]) {
      expect(json).toContain(`"type":"${type}"`);
    }
  });

  it('drops unsafe links and images that are not in the media library', () => {
    const doc = stored(`
      <p><a href="javascript:alert(1)">bad</a> <a href="https://ok.example">ok</a></p>
      <img src="https://evil.example/tracker.png">
      <img src="data:image/png;base64,AAAA">
    `);
    expect(validateRichDoc(doc)).toEqual([]);
    const json = JSON.stringify(doc);
    expect(json).not.toContain('javascript:');
    expect(json).not.toContain('evil.example');
    expect(json).not.toContain('data:image');
    expect(json).not.toContain('"type":"image"');
  });

  it('treats a blank editor as empty', () => {
    expect(isEmptyDoc(stored(''))).toBe(true);
    expect(isEmptyDoc(stored('<p>   </p>'))).toBe(true);
    expect(isEmptyDoc(stored('<p>Text</p>'))).toBe(false);
    expect(isEmptyDoc(stored(`<img data-media-id="${MEDIA_ID}">`))).toBe(false);
  });

  it('removes null and default attributes but keeps unknown types for the server to reject', () => {
    expect(
      toStoredDoc({
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { textAlign: null }, content: [{ type: 'text', text: 'a' }] },
          { type: 'orderedList', attrs: { start: 1, type: null }, content: [] },
          { type: 'mystery', attrs: { x: 1 } },
        ],
      }),
    ).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
        { type: 'orderedList', content: [] },
        { type: 'mystery' },
      ],
    });
  });
});
