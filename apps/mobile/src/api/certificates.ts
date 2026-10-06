import { useQuery } from '@tanstack/react-query';
import type { LocalizedText } from '@tk/contracts';
import { env } from '@/lib/env';
import { api } from './client';

/** Certificates for finishing a course (D-049, D-050). */

export interface MyCertificate {
  id: string;
  /** Printed form, e.g. `7K3M-Q9TX-2B4F`. */
  code: string;
  course: { id: string; slug: string; title: LocalizedText };
  issuedAt: string;
  revoked: boolean;
}

/** Returned when finishing a lesson earns certificates. */
export interface NewCertificate {
  id: string;
  code: string;
  course: { id: string; title: LocalizedText };
}

/** What the course page shows: the rule and the student's progress, or the certificate earned. */
export interface CourseCertificate {
  requiredPercent: number | null;
  progress: { completed: number; total: number };
  earned: { id: string; code: string; revoked: boolean } | null;
}

export const certificateKeys = { mine: ['certificates'] as const };

export function useMyCertificates() {
  return useQuery({
    queryKey: certificateKeys.mine,
    queryFn: () => api.get<MyCertificate[]>('/me/certificates'),
  });
}

/** The certificate PDF; public by number, so it opens in the browser and can be shared. */
export function certificatePdfUrl(code: string): string {
  return `${env.apiBaseUrl}/certificates/${code}/pdf`;
}
