import { fileURLToPath } from 'node:url';
import type { LocalizedText } from '@tk/contracts';
import { palette } from '@tk/design-tokens';
import { formatBs, formatNpr, instantToBs } from '@tk/domain';
import PDFDocument from 'pdfkit';

/** Everything printed on a receipt, as stored when it was issued (`invoices`). */
export interface ReceiptContent {
  invoiceNo: string;
  kind: 'receipt' | 'tax_invoice';
  orderNo: number;
  issuedAt: Date;
  paidWith: string | null;
  buyerName: string;
  buyerContact: string | null;
  seller: { businessName: string; panNumber: string; address: string };
  items: Array<{
    title: LocalizedText;
    unitPricePaisa: number;
    validity: { type: string; days: number | null; endsOn: string | null };
  }>;
  subtotalPaisa: number;
  discountPaisa: number;
  couponCode: string | null;
  taxRateBps: number | null;
  taxInclusive: boolean | null;
  taxPaisa: number;
  totalPaisa: number;
}

const font = (file: string) => fileURLToPath(new URL(`../../../assets/fonts/${file}`, import.meta.url));
const FONTS = {
  regular: font('Mukta_400Regular.ttf'),
  semibold: font('Mukta_600SemiBold.ttf'),
  bold: font('Mukta_700Bold.ttf'),
};
const PAGE_WIDTH = 595.28; // A4 portrait
const MARGIN = 56;
const PROVIDER: Record<string, string> = { esewa: 'eSewa', khalti: 'Khalti', connectips: 'ConnectIPS' };

const npr = (paisa: number) => formatNpr(paisa, 'en');
const title = (t: LocalizedText) => t.en ?? t.ne ?? '';

function dateLine(at: Date): string {
  const ad = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kathmandu',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(at);
  return `${formatBs(instantToBs(at), 'en')} (${ad})`;
}

function accessLine(v: ReceiptContent['items'][number]['validity']): string {
  if (v.type === 'days' && v.days) return `Access for ${v.days} days`;
  if (v.type === 'fixed_date' && v.endsOn) return `Access until ${v.endsOn}`;
  return 'Access with no end date';
}

/**
 * The receipt PDF (D-026, D-057): "Tax Invoice" when the business was VAT-registered when it was issued, "Receipt"
 * otherwise. Made from the stored snapshot, so it is the same every time.
 */
export async function renderReceiptPdf(r: ReceiptContent): Promise<Buffer> {
  const heading = r.kind === 'tax_invoice' ? 'Tax Invoice' : 'Receipt';
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    // pdfkit fails on an empty metadata value: Author only when the CMS has a business name.
    info: {
      Title: `${heading} ${r.invoiceNo}`,
      ...(r.seller.businessName ? { Author: r.seller.businessName } : {}),
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
  const width = PAGE_WIDTH - 2 * MARGIN;
  const right = MARGIN + width;

  // Seller (CMS: System settings → VAT and business details).
  doc.y = MARGIN;
  if (r.seller.businessName) {
    doc
      .font('bold')
      .fontSize(16)
      .fillColor(palette.ink900)
      .text(r.seller.businessName, MARGIN, doc.y, { width });
  }
  doc.font('regular').fontSize(10).fillColor(palette.slate600);
  if (r.seller.address) doc.text(r.seller.address, { width });
  if (r.seller.panNumber) doc.text(`PAN / VAT No.: ${r.seller.panNumber}`, { width });

  doc.moveDown(1.2);
  doc.font('bold').fontSize(22).fillColor(palette.navy800).text(heading, MARGIN, doc.y, { width });
  doc.moveDown(0.4);

  // Number, date, order and buyer.
  const top = doc.y;
  const field = (label: string, value: string, x: number, y: number, w: number) => {
    doc.font('regular').fontSize(9).fillColor(palette.slate500).text(label, x, y, { width: w });
    doc.font('semibold').fontSize(11).fillColor(palette.ink900).text(value, x, doc.y, { width: w });
  };
  const half = width / 2 - 8;
  field(`${heading} No.`, r.invoiceNo, MARGIN, top, half);
  field('Date', dateLine(r.issuedAt), MARGIN, doc.y + 6, half);
  field('Order', `#${String(r.orderNo).padStart(6, '0')}`, MARGIN, doc.y + 6, half);
  const leftEnd = doc.y;
  field('Billed to', r.buyerName, MARGIN + half + 16, top, half);
  if (r.buyerContact) {
    doc.font('regular').fontSize(10).fillColor(palette.slate600).text(r.buyerContact, { width: half });
  }
  field(
    'Paid with',
    r.paidWith ? (PROVIDER[r.paidWith] ?? r.paidWith) : 'Nothing to pay',
    MARGIN + half + 16,
    doc.y + 6,
    half,
  );
  doc.y = Math.max(leftEnd, doc.y) + 20;

  // Items.
  const amountW = 110;
  const rule = (y: number, color: string = palette.slate300, w = 0.75) =>
    doc.moveTo(MARGIN, y).lineTo(right, y).lineWidth(w).stroke(color);
  doc.font('semibold').fontSize(10).fillColor(palette.slate600);
  const headY = doc.y;
  doc.text('Item', MARGIN, headY, { width: width - amountW });
  doc.text('Amount', right - amountW, headY, { width: amountW, align: 'right' });
  rule(doc.y + 4, palette.slate400);
  doc.y += 10;
  for (const item of r.items) {
    const y = doc.y;
    doc
      .font('semibold')
      .fontSize(11)
      .fillColor(palette.ink900)
      .text(title(item.title), MARGIN, y, {
        width: width - amountW - 12,
      });
    doc
      .font('regular')
      .fontSize(9)
      .fillColor(palette.slate500)
      .text(accessLine(item.validity), {
        width: width - amountW - 12,
      });
    const end = doc.y;
    doc
      .font('regular')
      .fontSize(11)
      .fillColor(palette.ink900)
      .text(npr(item.unitPricePaisa), right - amountW, y, {
        width: amountW,
        align: 'right',
      });
    doc.y = end + 8;
  }
  rule(doc.y);
  doc.y += 8;

  // Totals.
  const totalRow = (label: string, value: string, strong = false) => {
    const y = doc.y;
    doc
      .font(strong ? 'bold' : 'regular')
      .fontSize(strong ? 13 : 11)
      .fillColor(strong ? palette.ink900 : palette.slate600)
      .text(label, MARGIN + width / 2, y, { width: width / 2 - amountW });
    doc.text(value, right - amountW, y, { width: amountW, align: 'right' });
    doc.y += 4;
  };
  const rate = r.taxRateBps !== null ? `${r.taxRateBps / 100}%` : '';
  totalRow('Price', npr(r.subtotalPaisa));
  if (r.discountPaisa > 0) totalRow(`Coupon ${r.couponCode ?? ''}`.trim(), `− ${npr(r.discountPaisa)}`);
  if (r.taxRateBps !== null) {
    const taxable = r.subtotalPaisa - r.discountPaisa - (r.taxInclusive ? r.taxPaisa : 0);
    totalRow('Taxable amount', npr(taxable));
    totalRow(`VAT (${rate})`, npr(r.taxPaisa));
  }
  rule(doc.y + 2, palette.slate400);
  doc.y += 8;
  totalRow('Total', npr(r.totalPaisa), true);
  if (r.taxRateBps !== null && r.taxInclusive) {
    doc
      .font('regular')
      .fontSize(9)
      .fillColor(palette.slate500)
      .text(`Prices include VAT (${rate}).`, MARGIN + width / 2, doc.y + 2, {
        width: width / 2,
        align: 'right',
      });
  }

  doc.end();
  return done;
}
