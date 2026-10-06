import { writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { renderCertificatePdf, type CertificateContent } from './certificate-pdf.js';

const content = (language: 'en' | 'ne'): CertificateContent => ({
  language,
  holderName: language === 'ne' ? 'अर्जुन श्रेष्ठ' : 'Arjun Shrestha',
  courseTitle: { en: 'Section Officer Preliminary Preparation', ne: 'शाखा अधिकृत प्रारम्भिक तयारी' },
  title: { en: 'Certificate of Completion', ne: 'पूरा गरेको प्रमाणपत्र' },
  intro: { en: 'This is to certify that', ne: 'यो प्रमाणित गरिन्छ कि' },
  statement: {
    en: 'has successfully completed the course',
    ne: 'ले निम्न पाठ्यक्रम सफलतापूर्वक पूरा गर्नुभएको छ',
  },
  issuerName: { en: 'Sample Academy', ne: 'नमुना एकेडेमी' },
  signatories: [
    { name: { en: 'Sita Karki', ne: 'सीता कार्की' }, role: { en: 'Director', ne: 'निर्देशक' } },
    { name: { en: 'Ram Thapa', ne: 'राम थापा' }, role: { en: 'Course Coordinator', ne: 'पाठ्यक्रम संयोजक' } },
  ],
});

async function pages(pdf: Buffer) {
  return (await PDFDocument.load(pdf)).getPages();
}

describe('certificate PDF', () => {
  it('renders one A4 landscape page in English and Nepali, with and without a verification link', async () => {
    const issuedAt = new Date('2026-10-06T06:00:00Z');
    for (const language of ['en', 'ne'] as const) {
      for (const verifyUrl of [null, 'https://example.com/certificates/7K3MQ9TX2B4F']) {
        const pdf = await renderCertificatePdf({
          content: content(language),
          code: '7K3MQ9TX2B4F',
          issuedAt,
          verifyUrl,
        });
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
        const [page, ...rest] = await pages(pdf);
        expect(rest).toHaveLength(0);
        expect(Math.round(page!.getWidth())).toBe(842);
        expect(Math.round(page!.getHeight())).toBe(595);
        // Set CERT_PDF_OUT to look at them.
        const out = process.env['CERT_PDF_OUT'];
        if (out) writeFileSync(`${out}/certificate-${language}${verifyUrl ? '-qr' : ''}.pdf`, pdf);
      }
    }
  });

  it('copes with no signatories and no intro', async () => {
    const pdf = await renderCertificatePdf({
      content: { ...content('en'), intro: null, signatories: [] },
      code: '000000000000',
      issuedAt: new Date(),
      verifyUrl: null,
    });
    expect(await pages(pdf)).toHaveLength(1);
  });
});
