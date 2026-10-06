import { fileURLToPath } from 'node:url';
import type { CertificateLanguage, CertificateSignatory, LocalizedText } from '@tk/contracts';
import { palette } from '@tk/design-tokens';
import { formatBs, formatCertificateCode, instantToBs } from '@tk/domain';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

/** What is printed on a certificate, frozen when it is issued (`certificates.content`). */
export interface CertificateContent {
  language: CertificateLanguage;
  holderName: string;
  courseTitle: LocalizedText;
  title: LocalizedText;
  intro: LocalizedText | null;
  statement: LocalizedText;
  issuerName: LocalizedText;
  signatories: CertificateSignatory[];
}

/** Mukta (OFL, the app's typeface) shapes Devanagari correctly through fontkit. */
const font = (file: string) => fileURLToPath(new URL(`../../../assets/fonts/${file}`, import.meta.url));
const FONTS = {
  regular: font('Mukta_400Regular.ttf'),
  semibold: font('Mukta_600SemiBold.ttf'),
  bold: font('Mukta_700Bold.ttf'),
};

/** Fixed labels printed around the CMS wording. */
const LABELS: Record<CertificateLanguage, { issued: string; number: string; verify: string }> = {
  en: { issued: 'Issued on', number: 'Certificate no.', verify: 'Verify at' },
  ne: { issued: 'जारी मिति', number: 'प्रमाणपत्र नं.', verify: 'प्रमाणीकरण' },
};

const PAGE = { width: 841.89, height: 595.28 }; // A4 landscape
const FRAME = 22;
const MARGIN = 72;

const pick = (text: LocalizedText | null, lang: CertificateLanguage) =>
  text ? (text[lang] ?? text.en ?? text.ne ?? '') : '';

function issuedOn(at: Date, lang: CertificateLanguage): string {
  const bs = formatBs(instantToBs(at), lang);
  if (lang === 'ne') return bs;
  const ad = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kathmandu',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(at);
  return `${bs} (${ad})`;
}

/** A4 landscape certificate; a QR code to the verification page when one is configured. */
export async function renderCertificatePdf(input: {
  content: CertificateContent;
  code: string;
  issuedAt: Date;
  verifyUrl: string | null;
}): Promise<Buffer> {
  const { content, code, issuedAt, verifyUrl } = input;
  const lang = content.language;
  const labels = LABELS[lang];
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 0,
    info: {
      Title: `${pick(content.title, lang)} — ${content.holderName}`,
      Author: pick(content.issuerName, lang),
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.registerFont('regular', FONTS.regular);
  doc.registerFont('semibold', FONTS.semibold);
  doc.registerFont('bold', FONTS.bold);

  // Frame.
  doc
    .rect(FRAME, FRAME, PAGE.width - 2 * FRAME, PAGE.height - 2 * FRAME)
    .lineWidth(3)
    .stroke(palette.navy800);
  doc
    .rect(FRAME + 8, FRAME + 8, PAGE.width - 2 * (FRAME + 8), PAGE.height - 2 * (FRAME + 8))
    .lineWidth(0.75)
    .stroke(palette.blue600);

  const width = PAGE.width - 2 * MARGIN;
  const line = (text: string, f: keyof typeof FONTS, size: number, color: string, gap: number) => {
    if (!text) return;
    doc.font(f).fontSize(size).fillColor(color).text(text, MARGIN, doc.y, { width, align: 'center' });
    doc.y += gap;
  };

  doc.y = 82;
  line(pick(content.issuerName, lang), 'semibold', 17, palette.blue600, 6);
  line(pick(content.title, lang), 'bold', 38, palette.ink900, 4);
  const ruleY = doc.y + 4;
  doc
    .moveTo(PAGE.width / 2 - 60, ruleY)
    .lineTo(PAGE.width / 2 + 60, ruleY)
    .lineWidth(1.5)
    .stroke(palette.blue600);
  doc.y = ruleY + 18;
  line(pick(content.intro, lang), 'regular', 14, palette.slate600, 2);
  line(content.holderName, 'bold', 32, palette.navy800, 2);
  line(pick(content.statement, lang), 'regular', 14, palette.slate600, 2);
  line(pick(content.courseTitle, lang), 'semibold', 22, palette.ink900, 10);
  line(`${labels.issued} ${issuedOn(issuedAt, lang)}`, 'regular', 12, palette.slate500, 0);

  // Signatories across the bottom, left of the QR code.
  const bottom = PAGE.height - FRAME - 46;
  const qrSize = verifyUrl ? 72 : 0;
  const signArea = { left: MARGIN, right: PAGE.width - MARGIN - (verifyUrl ? qrSize + 24 : 0) };
  const count = content.signatories.length;
  content.signatories.forEach((s, i) => {
    const slot = (signArea.right - signArea.left) / count;
    const cx = signArea.left + slot * (i + 0.5);
    const w = Math.min(200, slot - 16);
    const y = bottom - 52;
    doc
      .moveTo(cx - w / 2, y)
      .lineTo(cx + w / 2, y)
      .lineWidth(0.75)
      .stroke(palette.slate400);
    doc
      .font('semibold')
      .fontSize(13)
      .fillColor(palette.ink900)
      .text(pick(s.name, lang), cx - w / 2, y + 6, { width: w, align: 'center' });
    doc
      .font('regular')
      .fontSize(11)
      .fillColor(palette.slate500)
      .text(pick(s.role, lang), cx - w / 2, doc.y, { width: w, align: 'center' });
  });

  // Certificate number (and where to verify it).
  const printed = formatCertificateCode(code);
  doc
    .font('regular')
    .fontSize(10)
    .fillColor(palette.slate500)
    .text(`${labels.number} ${printed}`, MARGIN, bottom + 2, { width: width / 2, lineBreak: false });
  if (verifyUrl) {
    doc.fontSize(9).text(`${labels.verify}: ${verifyUrl}`, MARGIN, bottom + 15, {
      width: width - qrSize,
      lineBreak: false,
    });
    const qr = QRCode.create(verifyUrl, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const cell = qrSize / n;
    const x0 = PAGE.width - MARGIN - qrSize;
    const y0 = bottom + 24 - qrSize;
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        if (qr.modules.get(r, c)) doc.rect(x0 + c * cell, y0 + r * cell, cell + 0.05, cell + 0.05);
      }
    }
    doc.fill(palette.ink900);
  }

  doc.end();
  return done;
}
