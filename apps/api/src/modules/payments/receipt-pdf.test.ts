import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { renderReceiptPdf, type ReceiptContent } from './receipt-pdf.js';

const receipt = (overrides: Partial<ReceiptContent> = {}): ReceiptContent => ({
  invoiceNo: 'TK-2083/84-000042',
  kind: 'receipt',
  orderNo: 123,
  issuedAt: new Date('2026-10-06T06:00:00Z'),
  paidWith: 'khalti',
  buyerName: 'अर्जुन श्रेष्ठ',
  buyerContact: 'arjun@example.com',
  seller: { businessName: 'Sample Academy', panNumber: '', address: 'Kathmandu' },
  items: [
    {
      title: { en: 'Section Officer Preliminary', ne: 'शाखा अधिकृत प्रारम्भिक' },
      unitPricePaisa: 300_000,
      validity: { type: 'days', days: 365, endsOn: null },
    },
  ],
  subtotalPaisa: 300_000,
  discountPaisa: 30_000,
  couponCode: 'DASHAIN-10',
  taxRateBps: null,
  taxInclusive: null,
  taxPaisa: 0,
  totalPaisa: 270_000,
  ...overrides,
});

describe('receipt PDF (D-057)', () => {
  it('renders one A4 page titled with its kind and number — a receipt, a tax invoice, a Rs 0 order', async () => {
    const cases: Array<[Partial<ReceiptContent>, string]> = [
      [{}, 'Receipt TK-2083/84-000042'],
      // No business details in the CMS yet.
      [{ seller: { businessName: '', panNumber: '', address: '' } }, 'Receipt TK-2083/84-000042'],
      [
        {
          kind: 'tax_invoice',
          seller: { businessName: 'Sample Academy Pvt. Ltd.', panNumber: '123456789', address: 'Kathmandu' },
          taxRateBps: 1300,
          taxInclusive: true,
          taxPaisa: 31_062,
        },
        'Tax Invoice TK-2083/84-000042',
      ],
      [
        { paidWith: null, discountPaisa: 300_000, totalPaisa: 0, couponCode: 'FREE' },
        'Receipt TK-2083/84-000042',
      ],
    ];
    for (const [overrides, title] of cases) {
      const pdf = await renderReceiptPdf(receipt(overrides));
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      const doc = await PDFDocument.load(pdf);
      expect(doc.getTitle()).toBe(title);
      const pages = doc.getPages();
      expect(pages).toHaveLength(1);
      expect(Math.round(pages[0]!.getWidth())).toBe(595);
    }
  });
});
