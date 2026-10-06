import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ErrorCode, type CertificateSignatory, type LocalizedText } from '@tk/contracts';
import {
  certificateCodeFromBytes,
  certificateEarned,
  formatCertificateCode,
  normalizeCertificateCode,
} from '@tk/domain';
import { AppError, Errors } from '../../common/errors/app-error.js';
import {
  Prisma,
  type Certificate,
  type CertificateTemplate,
  type Course,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { courseProgress } from '../content/course-progress.js';
import { EntitlementsService } from '../content/entitlements.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { renderCertificatePdf, type CertificateContent } from './certificate-pdf.js';

const revoked = () =>
  new AppError(
    410,
    ErrorCode.CERTIFICATE_REVOKED,
    'This certificate has been revoked and is no longer valid',
  );

/** What a certificate from this template says about this student and course, frozen at issue. */
export function certificateContent(
  template: CertificateTemplate,
  holderName: string,
  courseTitle: LocalizedText,
): CertificateContent {
  return {
    language: template.language,
    holderName,
    courseTitle,
    title: template.title as LocalizedText,
    intro: (template.intro as LocalizedText | null) ?? null,
    statement: template.statement as LocalizedText,
    issuerName: template.issuerName as LocalizedText,
    signatories: template.signatories as CertificateSignatory[],
  };
}

/**
 * Certificates for finishing a course (D-049, D-050). A student with access to a course whose certificate template
 * is active earns it once the template's share of the course's lessons is finished; it is issued automatically
 * (when a lesson is finished, and whenever the student's certificates or the course are opened, which also covers
 * templates added later). Verification and the PDF are public by code — the code is the proof (60 random bits).
 */
@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly settings: SettingsService,
  ) {}

  /** Issues every certificate the student has earned but not yet received; returns the ones issued now. */
  async issueEarned(userId: string) {
    const entitled = await this.entitlements.activeCourseIds(userId);
    if (entitled.size === 0) return [];
    const courses = await this.prisma.course.findMany({
      where: {
        id: { in: [...entitled] },
        deletedAt: null,
        certificateTemplate: { active: true },
        certificates: { none: { userId } },
      },
      include: { certificateTemplate: true },
    });
    if (courses.length === 0) return [];
    const progress = await courseProgress(
      this.prisma,
      userId,
      courses.map((c) => c.id),
    );
    const earned = courses.filter((c) =>
      certificateEarned(progress.get(c.id)!, c.certificateTemplate!.requiredPercent),
    );
    if (earned.length === 0) return [];
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const issued: Array<{ id: string; code: string; course: { id: string; title: LocalizedText } }> = [];
    for (const course of earned) {
      const cert = await this.issue(userId, user.fullName, course, course.certificateTemplate!);
      if (cert)
        issued.push({ id: cert.id, code: formatCertificateCode(cert.code), course: this.courseRef(course) });
    }
    return issued;
  }

  /** The student's certificates, newest first (revoked ones are listed as such). */
  async mine(userId: string) {
    await this.issueEarned(userId);
    const rows = await this.prisma.certificate.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      include: { course: true },
    });
    return rows.map((c) => ({
      id: c.id,
      code: formatCertificateCode(c.code),
      course: { ...this.courseRef(c.course), slug: c.course.slug },
      issuedAt: c.issuedAt.toISOString(),
      revoked: c.revokedAt !== null,
    }));
  }

  /** The course page: what the certificate needs and how far the student is, or the one earned. */
  async forCourse(userId: string, courseId: string) {
    const course = await this.prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      include: { certificateTemplate: true },
    });
    let cert = await this.prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } });
    const template = course.certificateTemplate;
    if (!cert && !template?.active) return null;
    const progress = (await courseProgress(this.prisma, userId, [courseId])).get(courseId)!;
    if (!cert && template && certificateEarned(progress, template.requiredPercent)) {
      const entitled = await this.entitlements.activeCourseIds(userId);
      if (entitled.has(courseId)) {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
        cert =
          (await this.issue(userId, user.fullName, course, template)) ??
          (await this.prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } }));
      }
    }
    return {
      requiredPercent: template?.active ? template.requiredPercent : null,
      progress,
      earned: cert
        ? { id: cert.id, code: formatCertificateCode(cert.code), revoked: cert.revokedAt !== null }
        : null,
    };
  }

  /** Public check of a certificate number. */
  async verify(input: string) {
    const cert = await this.byCode(input);
    const content = cert.content as unknown as CertificateContent;
    return {
      code: formatCertificateCode(cert.code),
      status: cert.revokedAt ? ('revoked' as const) : ('valid' as const),
      holderName: content.holderName,
      courseTitle: content.courseTitle,
      issuerName: content.issuerName,
      language: content.language,
      issuedAt: cert.issuedAt.toISOString(),
      revokedAt: cert.revokedAt?.toISOString() ?? null,
    };
  }

  /** The certificate as a PDF (not for revoked certificates). */
  async pdf(input: string) {
    const cert = await this.byCode(input);
    if (cert.revokedAt) throw revoked();
    return {
      body: await this.render(cert.content as unknown as CertificateContent, cert.code, cert.issuedAt),
      filename: `certificate-${formatCertificateCode(cert.code)}.pdf`,
    };
  }

  async render(content: CertificateContent, code: string, issuedAt: Date): Promise<Buffer> {
    const { baseUrl } = await this.settings.get('certificates.verification');
    return renderCertificatePdf({
      content,
      code,
      issuedAt,
      verifyUrl: baseUrl ? `${baseUrl}/${code}` : null,
    });
  }

  // ───────────── helpers ─────────────

  private async byCode(input: string): Promise<Certificate> {
    const code = normalizeCertificateCode(input);
    const cert = code ? await this.prisma.certificate.findUnique({ where: { code } }) : null;
    if (!cert) throw Errors.notFound('Certificate');
    return cert;
  }

  /** Creates the certificate, or returns null when one already exists for this student and course (a race). */
  private async issue(userId: string, holderName: string, course: Course, template: CertificateTemplate) {
    const content = certificateContent(template, holderName, course.title as LocalizedText);
    for (let tries = 0; tries < 3; tries += 1) {
      try {
        return await this.prisma.certificate.create({
          data: {
            code: certificateCodeFromBytes(randomBytes(8)),
            userId,
            courseId: course.id,
            templateId: template.id,
            content: content as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
        const existing = await this.prisma.certificate.findUnique({
          where: { userId_courseId: { userId, courseId: course.id } },
        });
        if (existing) return null;
        // Otherwise the random code collided (practically never): draw another.
      }
    }
    throw new Error('Could not draw a unique certificate code');
  }

  private courseRef(course: Course) {
    return { id: course.id, title: course.title as LocalizedText };
  }
}
