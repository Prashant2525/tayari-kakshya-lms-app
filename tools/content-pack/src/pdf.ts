import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import type { BlockNode, Doc, Mark, TextNode } from './markdown.ts';

/**
 * Chapter handouts (D-071): our own PDF built from the pack's notes — a title band, each topic's note, and the
 * chapter's key points. pdf-lib's standard fonts cover Windows-1252 only, so text is mapped (α → alpha, → → ->)
 * and `unsupportedChars` lets the tests prove nothing is lost.
 */
const NAVY = rgb(0x15 / 255, 0x23 / 255, 0x4d / 255);
const BLUE = rgb(0x25 / 255, 0x63 / 255, 0xd6 / 255);
const INK = rgb(0x0f / 255, 0x1b / 255, 0x3d / 255);
const MUTED = rgb(0x47 / 255, 0x55 / 255, 0x69 / 255);
const RULE = rgb(0xe2 / 255, 0xe7 / 255, 0xef / 255);
const CODE_BG = rgb(0xf1 / 255, 0xf4 / 255, 0xf9 / 255);
const HEADER_BG = rgb(0xee / 255, 0xf4 / 255, 0xff / 255);

const PAGE = { width: 595.28, height: 841.89, margin: 54, footer: 34 } as const;

const REPLACEMENTS: Record<string, string> = {
  α: 'alpha',
  β: 'beta',
  γ: 'gamma',
  δ: 'delta',
  Δ: 'Delta',
  ε: 'epsilon',
  θ: 'theta',
  λ: 'lambda',
  μ: 'µ',
  π: 'pi',
  σ: 'sigma',
  Σ: 'Sum',
  ω: 'omega',
  η: 'eta',
  '→': '->',
  '←': '<-',
  '↔': '<->',
  '⇒': '=>',
  '≥': '>=',
  '≤': '<=',
  '≠': '!=',
  '≈': '~',
  '∞': 'infinity',
  '√': 'sqrt',
  '∑': 'Sum',
  '∂': 'd',
  '∈': 'in',
  '−': '-',
  '′': "'",
  '✓': 'v',
  '₹': 'Rs ',
  '\u00a0': ' ',
  ŷ: 'y-hat',
  ȳ: 'y-bar',
  '\u0304': '-bar',
  '∩': ' and ',
  '⇌': '<=>',
};
const CP1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const encodable = (ch: string) => {
  const code = ch.codePointAt(0)!;
  return (
    (code >= 0x20 && code < 0x7f) || (code >= 0xa0 && code <= 0xff) || CP1252_EXTRA.has(ch) || ch === '\n'
  );
};

/** Text the standard fonts can draw. */
export function pdfText(text: string): string {
  let out = '';
  for (const ch of text) out += REPLACEMENTS[ch] ?? (encodable(ch) ? ch : '?');
  return out;
}

/** Characters that would be lost (neither drawable nor mapped). */
export function unsupportedChars(text: string): string[] {
  return [...new Set([...text].filter((ch) => !REPLACEMENTS[ch] && !encodable(ch)))];
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
}
interface Style {
  size: number;
  color: RGB;
  bold?: boolean;
  italic?: boolean;
}
interface Segment {
  text: string;
  font: PDFFont;
  size: number;
  rise: number;
  color: RGB;
}

class Writer {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;
  private readonly doc: PDFDocument;
  readonly fonts: Fonts;
  constructor(doc: PDFDocument, fonts: Fonts) {
    this.doc = doc;
    this.fonts = fonts;
    this.newPage();
  }

  get left(): number {
    return PAGE.margin;
  }
  get width(): number {
    return PAGE.width - PAGE.margin * 2;
  }

  newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.pages.push(this.page);
    this.y = PAGE.height - PAGE.margin;
  }

  /** Room for `height` more points on this page, or a new page. */
  ensure(height: number) {
    if (this.y - height < PAGE.margin + PAGE.footer) this.newPage();
  }

  space(points: number) {
    this.y -= points;
  }

  segments(nodes: Array<BlockNode | TextNode>, style: Style): Segment[] {
    const out: Segment[] = [];
    for (const node of nodes) {
      if (node.type === 'hardBreak') {
        out.push({ text: '\n', font: this.fonts.regular, size: style.size, rise: 0, color: style.color });
        continue;
      }
      if (node.type !== 'text') continue;
      const marks = new Set(((node as TextNode).marks ?? []).map((m: Mark) => m.type));
      const bold = style.bold || marks.has('bold');
      const italic = style.italic || marks.has('italic');
      const font = marks.has('code')
        ? this.fonts.mono
        : bold && italic
          ? this.fonts.boldItalic
          : bold
            ? this.fonts.bold
            : italic
              ? this.fonts.italic
              : this.fonts.regular;
      const small = marks.has('subscript') || marks.has('superscript');
      out.push({
        text: pdfText((node as TextNode).text),
        font,
        size: small ? style.size * 0.72 : marks.has('code') ? style.size * 0.92 : style.size,
        rise: marks.has('subscript') ? -style.size * 0.22 : marks.has('superscript') ? style.size * 0.38 : 0,
        color: marks.has('code') ? NAVY : style.color,
      });
    }
    return out;
  }

  /** Wraps segments into lines no wider than `width`. */
  wrap(segments: Segment[], width: number): Segment[][] {
    const lines: Segment[][] = [];
    let line: Segment[] = [];
    let lineWidth = 0;
    const push = () => {
      // Drop trailing spaces.
      while (line.length && /^\s+$/.test(line[line.length - 1]!.text)) line.pop();
      lines.push(line);
      line = [];
      lineWidth = 0;
    };
    for (const seg of segments) {
      if (seg.text === '\n') {
        push();
        continue;
      }
      for (const word of seg.text.split(/(\s+)/)) {
        if (!word) continue;
        const isSpace = /^\s+$/.test(word);
        if (isSpace && line.length === 0) continue;
        let piece = isSpace ? ' ' : word;
        let w = seg.font.widthOfTextAtSize(piece, seg.size);
        if (!isSpace && lineWidth + w > width && line.length) push();
        // A word longer than the line (a URL, long code) is broken up.
        while (!isSpace && w > width) {
          let n = piece.length - 1;
          while (n > 1 && seg.font.widthOfTextAtSize(piece.slice(0, n), seg.size) > width - lineWidth) n -= 1;
          line.push({ ...seg, text: piece.slice(0, n) });
          push();
          piece = piece.slice(n);
          w = seg.font.widthOfTextAtSize(piece, seg.size);
        }
        line.push({ ...seg, text: piece });
        lineWidth += w;
      }
    }
    if (line.length) push();
    return lines;
  }

  /** Draws wrapped text at `x`, `indent` points in; returns nothing (moves the cursor down). */
  text(
    nodes: Array<BlockNode | TextNode>,
    style: Style,
    opts: { x?: number; width?: number; lineHeight?: number } = {},
  ) {
    const x = opts.x ?? this.left;
    const width = opts.width ?? this.width - (x - this.left);
    const lineHeight = opts.lineHeight ?? style.size * 1.42;
    for (const line of this.wrap(this.segments(nodes, style), width)) {
      this.ensure(lineHeight);
      this.y -= lineHeight;
      let cx = x;
      for (const seg of line) {
        this.page.drawText(seg.text, {
          x: cx,
          y: this.y + seg.rise + lineHeight * 0.22,
          size: seg.size,
          font: seg.font,
          color: seg.color,
        });
        cx += seg.font.widthOfTextAtSize(seg.text, seg.size);
      }
    }
  }

  plain(text: string, style: Style, opts: { x?: number; width?: number; lineHeight?: number } = {}) {
    this.text([{ type: 'text', text }], style, opts);
  }
}

const BODY: Style = { size: 10.5, color: INK };

function renderBlocks(w: Writer, blocks: BlockNode[], x: number = w.left) {
  for (const block of blocks) renderBlock(w, block, x);
}

function renderBlock(w: Writer, block: BlockNode, x: number) {
  const content = block.content ?? [];
  switch (block.type) {
    case 'heading': {
      const level = Number(block.attrs?.['level'] ?? 2);
      const size = level === 2 ? 13 : level === 3 ? 11.5 : 10.5;
      w.space(level === 2 ? 8 : 5);
      // Keep a heading with the start of what follows it.
      w.ensure(size * 1.42 + 48);
      w.text(content, { size, color: level === 2 ? NAVY : INK, bold: true }, { x });
      w.space(3);
      return;
    }
    case 'paragraph':
      w.text(content, BODY, { x });
      w.space(5);
      return;
    case 'bulletList':
    case 'orderedList': {
      const start = Number(block.attrs?.['start'] ?? 1);
      content.forEach((item, i) => {
        const marker = block.type === 'bulletList' ? '•' : `${start + i}.`;
        // Room for the first line is reserved here, so the marker's page and line are known before drawing.
        const lineHeight = BODY.size * 1.42;
        w.ensure(lineHeight + 1);
        const page = w.page;
        const firstLineY = w.y - lineHeight;
        const paragraphs = ((item as BlockNode).content ?? []) as BlockNode[];
        paragraphs.forEach((p, j) => {
          if (p.type === 'paragraph') w.text(p.content ?? [], BODY, { x: x + 16 });
          else renderBlock(w, p, x + 16);
          if (j < paragraphs.length - 1) w.space(2);
        });
        page.drawText(marker, {
          x: x + 3,
          y: firstLineY + lineHeight * 0.22,
          size: BODY.size,
          font: block.type === 'bulletList' ? w.fonts.bold : w.fonts.regular,
          color: BLUE,
        });
        w.space(2.5);
      });
      w.space(4);
      return;
    }
    case 'blockquote': {
      w.ensure(BODY.size * 1.42 + 1);
      const top = w.y;
      const page = w.page;
      for (const p of content as BlockNode[])
        w.text(p.content ?? [], { ...BODY, italic: true, color: MUTED }, { x: x + 14 });
      if (page === w.page) page.drawRectangle({ x: x + 2, y: w.y, width: 3, height: top - w.y, color: BLUE });
      w.space(6);
      return;
    }
    case 'codeBlock': {
      const text = content.map((n) => (n as TextNode).text ?? '').join('');
      const size = 8.6;
      const lineHeight = 11.5;
      const width = w.width - (x - w.left) - 16;
      w.space(2);
      for (const raw of pdfText(text).split('\n')) {
        // Long code lines are broken at the box edge.
        const pieces: string[] = [];
        let rest = raw.replace(/\t/g, '  ');
        do {
          let n = rest.length;
          while (n > 1 && w.fonts.mono.widthOfTextAtSize(rest.slice(0, n), size) > width) n -= 1;
          pieces.push(rest.slice(0, n));
          rest = rest.slice(n);
        } while (rest.length);
        for (const piece of pieces) {
          w.ensure(lineHeight);
          w.page.drawRectangle({
            x,
            y: w.y - lineHeight,
            width: w.width - (x - w.left),
            height: lineHeight,
            color: CODE_BG,
          });
          w.y -= lineHeight;
          w.page.drawText(piece, { x: x + 8, y: w.y + 3, size, font: w.fonts.mono, color: NAVY });
        }
      }
      w.space(8);
      return;
    }
    case 'table': {
      const rows = content as BlockNode[];
      const columns = Math.max(...rows.map((r) => (r.content ?? []).length));
      const width = w.width - (x - w.left);
      const colWidth = width / columns;
      const size = 9.2;
      const lineHeight = size * 1.38;
      w.space(2);
      for (const row of rows) {
        const cells = (row.content ?? []) as BlockNode[];
        const header = cells[0]?.type === 'tableHeader';
        const style: Style = { size, color: INK, bold: header };
        const wrapped = cells.map((cell) => {
          const nodes = ((cell.content ?? []) as BlockNode[]).flatMap((p) => p.content ?? []);
          return w.wrap(w.segments(nodes, style), colWidth - 10);
        });
        const height = Math.max(1, ...wrapped.map((l) => l.length)) * lineHeight + 8;
        w.ensure(height);
        const top = w.y;
        if (header) w.page.drawRectangle({ x, y: top - height, width, height, color: HEADER_BG });
        wrapped.forEach((lines, c) => {
          let cy = top - 4;
          for (const line of lines) {
            cy -= lineHeight;
            let cx = x + c * colWidth + 5;
            for (const seg of line) {
              w.page.drawText(seg.text, {
                x: cx,
                y: cy + seg.rise + lineHeight * 0.25,
                size: seg.size,
                font: seg.font,
                color: seg.color,
              });
              cx += seg.font.widthOfTextAtSize(seg.text, seg.size);
            }
          }
        });
        for (let c = 0; c <= columns; c += 1) {
          w.page.drawLine({
            start: { x: x + c * colWidth, y: top },
            end: { x: x + c * colWidth, y: top - height },
            thickness: 0.6,
            color: RULE,
          });
        }
        w.page.drawLine({ start: { x, y: top }, end: { x: x + width, y: top }, thickness: 0.6, color: RULE });
        w.page.drawLine({
          start: { x, y: top - height },
          end: { x: x + width, y: top - height },
          thickness: 0.6,
          color: RULE,
        });
        w.y = top - height;
      }
      w.space(8);
      return;
    }
    case 'horizontalRule':
      w.ensure(12);
      w.space(6);
      w.page.drawLine({ start: { x, y: w.y }, end: { x: x + w.width, y: w.y }, thickness: 0.8, color: RULE });
      w.space(6);
      return;
    default:
      if (content.length) renderBlocks(w, content as BlockNode[], x);
  }
}

export interface Handout {
  courseTitle: string;
  chapterLabel: string;
  chapterTitle: string;
  sections: Array<{ title: string; doc: Doc }>;
}

/** A chapter handout as PDF bytes. */
export async function renderHandout(handout: Handout): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfText(`${handout.courseTitle} - ${handout.chapterLabel}: ${handout.chapterTitle}`));
  pdf.setAuthor('Tayari Kakshya');
  pdf.setCreator('Tayari Kakshya content pack');
  pdf.setProducer('pdf-lib');
  // Fixed dates: the same notes give the same file (no change on re-builds).
  pdf.setCreationDate(new Date('2026-10-12T00:00:00Z'));
  pdf.setModificationDate(new Date('2026-10-12T00:00:00Z'));
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };
  const w = new Writer(pdf, fonts);

  // Title band.
  const bandHeight = 92;
  w.page.drawRectangle({
    x: 0,
    y: PAGE.height - bandHeight,
    width: PAGE.width,
    height: bandHeight,
    color: NAVY,
  });
  w.page.drawText(pdfText(handout.courseTitle.toUpperCase()), {
    x: PAGE.margin,
    y: PAGE.height - 34,
    size: 9,
    font: fonts.bold,
    color: rgb(0.86, 0.91, 0.99),
  });
  w.page.drawText(pdfText(`${handout.chapterLabel}: ${handout.chapterTitle}`), {
    x: PAGE.margin,
    y: PAGE.height - 58,
    size: 17,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
  w.page.drawText('Study handout  ·  Tayari Kakshya', {
    x: PAGE.margin,
    y: PAGE.height - 77,
    size: 9,
    font: fonts.regular,
    color: rgb(0.86, 0.91, 0.99),
  });
  w.y = PAGE.height - bandHeight - 22;

  handout.sections.forEach((section, i) => {
    if (i > 0) w.space(10);
    // A section title never ends a page on its own.
    w.ensure(110);
    w.plain(section.title, { size: 15, color: NAVY, bold: true });
    w.space(3);
    w.page.drawLine({
      start: { x: w.left, y: w.y },
      end: { x: w.left + w.width, y: w.y },
      thickness: 1.2,
      color: BLUE,
    });
    w.space(8);
    renderBlocks(w, section.doc.content);
  });

  // Footers once the page count is known.
  const total = w.pages.length;
  w.pages.forEach((page, i) => {
    const footer = pdfText(`${handout.courseTitle}  ·  ${handout.chapterLabel}`);
    page.drawLine({
      start: { x: PAGE.margin, y: PAGE.margin - 6 },
      end: { x: PAGE.width - PAGE.margin, y: PAGE.margin - 6 },
      thickness: 0.6,
      color: RULE,
    });
    page.drawText(footer, {
      x: PAGE.margin,
      y: PAGE.margin - 20,
      size: 8,
      font: fonts.regular,
      color: MUTED,
    });
    const label = `Page ${i + 1} of ${total}`;
    page.drawText(label, {
      x: PAGE.width - PAGE.margin - fonts.regular.widthOfTextAtSize(label, 8),
      y: PAGE.margin - 20,
      size: 8,
      font: fonts.regular,
      color: MUTED,
    });
  });
  return pdf.save({ useObjectStreams: true });
}
