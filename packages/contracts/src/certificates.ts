import { z } from 'zod';
import { CursorQuery, LocalizedText } from './common.js';

/** Certificates for finishing a course (D-049, D-050). */
export const CertificateLanguage = z.enum(['en', 'ne']);
export type CertificateLanguage = z.infer<typeof CertificateLanguage>;

export const CertificateSignatory = z.object({ name: LocalizedText, role: LocalizedText });
export type CertificateSignatory = z.infer<typeof CertificateSignatory>;

export const CERTIFICATE_SIGNATORIES_MAX = 3;

export const CertificateTemplateInput = z.object({
  name: z.string().trim().min(1).max(120),
  language: CertificateLanguage,
  /** Share of the course's lessons to finish, in percent. */
  requiredPercent: z.number().int().min(1).max(100),
  title: LocalizedText,
  intro: LocalizedText.nullable(),
  statement: LocalizedText,
  issuerName: LocalizedText,
  signatories: z.array(CertificateSignatory).max(CERTIFICATE_SIGNATORIES_MAX),
  active: z.boolean(),
});
export type CertificateTemplateInput = z.infer<typeof CertificateTemplateInput>;

/** Which template a course's certificate uses; null = no certificate. */
export const CourseCertificateInput = z.object({ templateId: z.uuid().nullable() });
export type CourseCertificateInput = z.infer<typeof CourseCertificateInput>;

export const RevokeCertificateInput = z.object({ reason: z.string().trim().min(3).max(500) });
export type RevokeCertificateInput = z.infer<typeof RevokeCertificateInput>;

export const AdminCertificateQuery = CursorQuery.extend({
  courseId: z.uuid().optional(),
  status: z.enum(['valid', 'revoked']).optional(),
  /** Student name or email, or a certificate code. */
  q: z.string().trim().min(1).max(120).optional(),
});
export type AdminCertificateQuery = z.infer<typeof AdminCertificateQuery>;
