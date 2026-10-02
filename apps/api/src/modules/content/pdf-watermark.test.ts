import { PDFDocument } from 'pdf-lib';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { watermarkPdf } from './pdf-watermark.js';

/** Concatenated, decompressed page content streams (where drawn text lives). */
async function pageText(pdfBytes: Buffer): Promise<string> {
  const doc = await PDFDocument.load(pdfBytes);
  const parts: string[] = [];
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const streams = contents && 'asArray' in contents ? contents.asArray() : [contents];
    for (const ref of streams) {
      const stream = doc.context.lookup(ref) as {
        getContents?: () => Uint8Array;
        dict?: { toString(): string };
      };
      const raw = Buffer.from(stream.getContents?.() ?? []);
      const isFlate = stream.dict?.toString().includes('FlateDecode');
      parts.push((isFlate ? inflateSync(raw) : raw).toString('latin1'));
    }
  }
  return parts.join('\n');
}

const hex = (s: string) => Buffer.from(s, 'latin1').toString('hex').toUpperCase();

describe('watermarkPdf', () => {
  it('stamps every page with the licence label (footer + diagonal) and keeps the page count', async () => {
    const source = await PDFDocument.create();
    source.addPage();
    source.addPage();
    const out = await watermarkPdf(
      Buffer.from(await source.save()),
      'Licensed to asha@example.com - ID 0199b6a2',
    );
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    const text = (await pageText(out)).toUpperCase();
    const occurrences = text.split(hex('Licensed to asha@example.com')).length - 1;
    expect(occurrences).toBe(4); // 2 pages x (footer + diagonal)
  });

  it('drops characters standard PDF fonts cannot draw instead of failing', async () => {
    const source = await PDFDocument.create();
    source.addPage();
    const out = await watermarkPdf(Buffer.from(await source.save()), 'Licensed to आशा asha@example.com');
    expect((await pageText(out)).toUpperCase()).toContain(hex('Licensed to asha@example.com'));
  });
});
