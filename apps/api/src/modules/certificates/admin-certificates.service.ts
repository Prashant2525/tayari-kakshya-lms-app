import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type AdminCertificateQuery,
  type CertificateTemplateInput,
  type CourseCertificateInput,
  type LocalizedText,
  type RevokeCertificateInput,
} from '@tk/contracts';
import { formatCertificateCode, normalizeCertificateCode } from '@tk/domain';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { Prisma, type CertificateTemplate } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ScopeService, type ContentActor } from '../content/scope.service.js';
import type { CertificateContent } from './certificate-pdf.js';
import { certificateContent, CertificatesService } from './certificates.service.js';

const json = (v: unknown) => (v ?? Prisma.DbNull) as Prisma.InputJsonValue;

/**
 * Certificates in the CMS (D-049, D-050): templates (wording, signatories, share of lessons), which template a
 * course uses, and issued certificates (revoke / reinstate, always audited). Issued certificates of courses outside
 * a scoped staff member's courses are not shown to them.
 */
@Injectable()
export class AdminCertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly certificates: CertificatesService,
  ) {}

  // ───────────── Templates ─────────────

  async templates() {
    const rows = await this.prisma.certificateTemplate.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { courses: { where: { deletedAt: null } }, certificates: true } } },
    });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      language: t.language,
      requiredPercent: t.requiredPercent,
      active: t.active,
      courseCount: t._count.courses,
      issuedCount: t._count.certificates,
      updatedAt: t.updatedAt.toISOString(),
    }));
  }

  async template(id: string) {
    const t = await this.findTemplate(id);
    const courses = await this.prisma.course.findMany({
      where: { certificateTemplateId: id, deletedAt: null },
      orderBy: { id: 'desc' },
      select: { id: true, title: true, status: true },
    });
    return {
      ...this.templateView(t),
      courses: courses.map((c) => ({ id: c.id, title: c.title as LocalizedText, status: c.status })),
    };
  }

  async createTemplate(input: CertificateTemplateInput, actor: ContentActor) {
    const t = await this.prisma.$transaction(async (tx) => {
      const row = await tx.certificateTemplate.create({
        data: { ...this.templateData(input), createdById: actor.userId, updatedById: actor.userId },
      });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'certificate_template.create',
          entityType: 'certificate_template',
          entityId: row.id,
          changes: { after: input },
          client: actor.client,
        },
        tx,
      );
      return row;
    });
    return { id: t.id };
  }

  /** Edits apply to certificates issued from now on; issued ones keep what they say. */
  async updateTemplate(id: string, input: CertificateTemplateInput, actor: ContentActor) {
    const before = await this.findTemplate(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.certificateTemplate.update({
        where: { id },
        data: { ...this.templateData(input), updatedById: actor.userId },
      });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'certificate_template.update',
          entityType: 'certificate_template',
          entityId: id,
          changes: { before: this.templateView(before), after: input },
          client: actor.client,
        },
        tx,
      );
    });
  }

  /** A sample certificate from the template as it is now (sample student and course). */
  async preview(id: string) {
    const t = await this.findTemplate(id);
    const sample = t.language === 'ne' ? 'नमुना विद्यार्थी' : 'Sample Student';
    const content = certificateContent(t, sample, { en: 'Sample course', ne: 'नमुना पाठ्यक्रम' });
    return this.certificates.render(content, '000000000000', new Date());
  }

  /** Which template a course's certificate uses (null = none). Students who already qualify receive it next time. */
  async setCourseTemplate(courseId: string, input: CourseCertificateInput, actor: ContentActor) {
    await this.scope.assertCourse(actor, courseId);
    const course = await this.prisma.course.findFirst({ where: { id: courseId, deletedAt: null } });
    if (!course) throw Errors.notFound('Course');
    if (input.templateId) await this.findTemplate(input.templateId);
    await this.prisma.$transaction(async (tx) => {
      await tx.course.update({
        where: { id: courseId },
        data: { certificateTemplateId: input.templateId, updatedById: actor.userId },
      });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'course.certificate',
          entityType: 'course',
          entityId: courseId,
          changes: { before: { templateId: course.certificateTemplateId }, after: input },
          client: actor.client,
        },
        tx,
      );
    });
  }

  // ───────────── Issued certificates ─────────────

  async issued(query: AdminCertificateQuery, actor: ContentActor) {
    const allowed = await this.scope.allowedCourseIds(actor);
    const code = query.q ? normalizeCertificateCode(query.q) : null;
    const where: Prisma.CertificateWhereInput = {
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.status === 'valid' ? { revokedAt: null } : {}),
      ...(query.status === 'revoked' ? { revokedAt: { not: null } } : {}),
      AND: [
        allowed ? { courseId: { in: [...allowed] } } : {},
        query.q
          ? {
              OR: [
                ...(code ? [{ code }] : []),
                { user: { fullName: { contains: query.q, mode: 'insensitive' as const } } },
                { user: { email: { contains: query.q.toLowerCase() } } },
              ],
            }
          : {},
      ],
      ...(query.cursor ? { id: { lt: query.cursor } } : {}),
    };
    const rows = await this.prisma.certificate.findMany({
      where,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      include: {
        course: { select: { id: true, title: true } },
        user: { select: { id: true, fullName: true, email: true, phone: true } },
        revokedBy: { select: { fullName: true } },
      },
    });
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((c) => ({
        id: c.id,
        code: formatCertificateCode(c.code),
        holderName: (c.content as unknown as CertificateContent).holderName,
        student: { id: c.user.id, fullName: c.user.fullName, contact: c.user.email ?? c.user.phone },
        course: { id: c.course.id, title: c.course.title as LocalizedText },
        issuedAt: c.issuedAt.toISOString(),
        revoked: c.revokedAt
          ? { at: c.revokedAt.toISOString(), by: c.revokedBy?.fullName ?? null, reason: c.revokeReason }
          : null,
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  /** Revoked certificates stop verifying and their PDF is no longer served; the record stays (reinstatable). */
  async revoke(id: string, input: RevokeCertificateInput, actor: ContentActor) {
    const cert = await this.findCertificate(id, actor);
    if (cert.revokedAt) throw new AppError(409, ErrorCode.CONFLICT, 'This certificate is already revoked');
    await this.prisma.$transaction(async (tx) => {
      await tx.certificate.update({
        where: { id },
        data: { revokedAt: new Date(), revokedById: actor.userId, revokeReason: input.reason },
      });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'certificate.revoke',
          entityType: 'certificate',
          entityId: id,
          changes: { code: cert.code, userId: cert.userId, courseId: cert.courseId, reason: input.reason },
          client: actor.client,
        },
        tx,
      );
    });
  }

  async reinstate(id: string, actor: ContentActor) {
    const cert = await this.findCertificate(id, actor);
    if (!cert.revokedAt) throw new AppError(409, ErrorCode.CONFLICT, 'This certificate is not revoked');
    await this.prisma.$transaction(async (tx) => {
      await tx.certificate.update({
        where: { id },
        data: { revokedAt: null, revokedById: null, revokeReason: null },
      });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'certificate.reinstate',
          entityType: 'certificate',
          entityId: id,
          changes: { code: cert.code, before: { revokedAt: cert.revokedAt, reason: cert.revokeReason } },
          client: actor.client,
        },
        tx,
      );
    });
  }

  // ───────────── helpers ─────────────

  private async findTemplate(id: string) {
    const t = await this.prisma.certificateTemplate.findUnique({ where: { id } });
    if (!t) throw Errors.notFound('Certificate template');
    return t;
  }

  private async findCertificate(id: string, actor: ContentActor) {
    const cert = await this.prisma.certificate.findUnique({ where: { id } });
    if (!cert) throw Errors.notFound('Certificate');
    await this.scope.assertCourse(actor, cert.courseId);
    return cert;
  }

  private templateData(input: CertificateTemplateInput) {
    return {
      name: input.name,
      language: input.language,
      requiredPercent: input.requiredPercent,
      title: json(input.title),
      intro: json(input.intro),
      statement: json(input.statement),
      issuerName: json(input.issuerName),
      signatories: json(input.signatories),
      active: input.active,
    };
  }

  private templateView(t: CertificateTemplate) {
    return {
      id: t.id,
      name: t.name,
      language: t.language,
      requiredPercent: t.requiredPercent,
      title: t.title as LocalizedText,
      intro: (t.intro as LocalizedText | null) ?? null,
      statement: t.statement as LocalizedText,
      issuerName: t.issuerName as LocalizedText,
      signatories: t.signatories as CertificateContent['signatories'],
      active: t.active,
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
