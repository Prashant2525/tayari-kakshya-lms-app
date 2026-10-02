import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';

/** A real PNG generated on the fly (with EXIF metadata so tests can prove it is stripped). */
export async function pngFixture(width = 1600, height = 900, color = '#2563D6'): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .withMetadata({ exif: { IFD0: { Copyright: 'secret-exif-marker' } } })
    .png()
    .toBuffer();
}

export async function pdfFixture(pages = 3): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++)
    doc.addPage().drawText(`Test page ${i}`, { x: 50, y: 700, font, size: 24 });
  return Buffer.from(await doc.save());
}
