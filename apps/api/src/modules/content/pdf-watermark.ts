import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/** Standard PDF fonts only cover WinAnsi; drop anything else so stamping never fails. */
function ascii(text: string): string {
  return text
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Stamps every page with who the copy was issued to (D-014): a footer line plus a faint diagonal mark.
 * Uses identifiers (email/phone, short user id), not names, so it never needs Devanagari glyphs.
 */
export async function watermarkPdf(source: Buffer, label: string): Promise<Buffer> {
  const doc = await PDFDocument.load(source, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const text = ascii(label);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const footerSize = Math.max(7, Math.min(9, width / 70));
    page.drawText(text, {
      x: 24,
      y: 14,
      size: footerSize,
      font,
      color: rgb(0.35, 0.38, 0.45),
      opacity: 0.85,
    });
    const diagonalSize = Math.min(width, height) / 22;
    const diagonalWidth = font.widthOfTextAtSize(text, diagonalSize);
    page.drawText(text, {
      x: width / 2 - (diagonalWidth / 2) * Math.cos(Math.PI / 6),
      y: height / 2 - (diagonalWidth / 2) * Math.sin(Math.PI / 6),
      size: diagonalSize,
      font,
      color: rgb(0.15, 0.2, 0.35),
      opacity: 0.07,
      rotate: degrees(30),
    });
  }
  doc.setProducer('Tayari Kakshya');
  return Buffer.from(await doc.save());
}
