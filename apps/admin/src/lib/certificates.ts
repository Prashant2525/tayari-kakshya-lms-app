import type { CertificateLanguage, CertificateSignatory, LocalizedText } from '@tk/contracts';

/** Certificates for finishing a course (D-049, D-050). */

export const LANGUAGE_LABEL: Record<CertificateLanguage, string> = { en: 'English', ne: 'नेपाली (Nepali)' };

export interface CertificateTemplateRow {
  id: string;
  name: string;
  language: CertificateLanguage;
  requiredPercent: number;
  active: boolean;
  courseCount: number;
  issuedCount: number;
  updatedAt: string;
}

export interface CertificateTemplate {
  id: string;
  name: string;
  language: CertificateLanguage;
  requiredPercent: number;
  title: LocalizedText;
  intro: LocalizedText | null;
  statement: LocalizedText;
  issuerName: LocalizedText;
  signatories: CertificateSignatory[];
  active: boolean;
  updatedAt: string;
  courses: Array<{ id: string; title: LocalizedText; status: string }>;
}

export interface IssuedCertificate {
  id: string;
  code: string;
  holderName: string;
  student: { id: string; fullName: string; contact: string | null };
  course: { id: string; title: LocalizedText };
  issuedAt: string;
  revoked: { at: string; by: string | null; reason: string | null } | null;
}
