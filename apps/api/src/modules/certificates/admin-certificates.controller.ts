import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AdminCertificateQuery,
  CertificateTemplateInput,
  CourseCertificateInput,
  RevokeCertificateInput,
} from '@tk/contracts';
import type { FastifyReply } from 'fastify';
import { Audiences, RequireAnyPermission, RequirePermissions } from '../../common/auth/auth-context.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { AdminCertificatesService } from './admin-certificates.service.js';

const uuid = () => new ParseUUIDPipe();

/** Certificate templates, the template of a course, and issued certificates (D-049, D-050). */
@ApiTags('admin-certificates')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin')
export class AdminCertificatesController {
  constructor(private readonly certificates: AdminCertificatesService) {}

  /** Course editors see the list to pick a template for their course. */
  @Get('certificate-templates')
  @RequireAnyPermission('certificates:manage', 'courses:edit')
  templates() {
    return this.certificates.templates();
  }

  @Post('certificate-templates')
  @RequirePermissions('certificates:manage')
  @ApiZodBody(CertificateTemplateInput)
  create(@ZodBody(CertificateTemplateInput) body: CertificateTemplateInput, @StaffActor() a: ContentActor) {
    return this.certificates.createTemplate(body, a);
  }

  @Get('certificate-templates/:id')
  @RequirePermissions('certificates:manage')
  template(@Param('id', uuid()) id: string) {
    return this.certificates.template(id);
  }

  @Put('certificate-templates/:id')
  @RequirePermissions('certificates:manage')
  @ApiZodBody(CertificateTemplateInput)
  async update(
    @Param('id', uuid()) id: string,
    @ZodBody(CertificateTemplateInput) body: CertificateTemplateInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.certificates.updateTemplate(id, body, a);
    return this.certificates.template(id);
  }

  @Get('certificate-templates/:id/preview')
  @RequirePermissions('certificates:manage')
  async preview(@Param('id', uuid()) id: string, @Res() reply: FastifyReply) {
    const body = await this.certificates.preview(id);
    void reply
      .header('Content-Type', 'application/pdf')
      .header('Cache-Control', 'private, no-store')
      .header('Content-Disposition', 'inline; filename="certificate-preview.pdf"')
      .send(body);
  }

  @Put('courses/:id/certificate')
  @RequireAnyPermission('certificates:manage', 'courses:edit')
  @ApiZodBody(CourseCertificateInput)
  async setCourseTemplate(
    @Param('id', uuid()) id: string,
    @ZodBody(CourseCertificateInput) body: CourseCertificateInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.certificates.setCourseTemplate(id, body, a);
    return { templateId: body.templateId };
  }

  @Get('certificates')
  @RequirePermissions('certificates:manage')
  issued(@ZodQuery(AdminCertificateQuery) query: AdminCertificateQuery, @StaffActor() a: ContentActor) {
    return this.certificates.issued(query, a);
  }

  @Post('certificates/:id/revoke')
  @HttpCode(204)
  @RequirePermissions('certificates:manage')
  @ApiZodBody(RevokeCertificateInput)
  async revoke(
    @Param('id', uuid()) id: string,
    @ZodBody(RevokeCertificateInput) body: RevokeCertificateInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.certificates.revoke(id, body, a);
  }

  @Post('certificates/:id/reinstate')
  @HttpCode(204)
  @RequirePermissions('certificates:manage')
  async reinstate(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.certificates.reinstate(id, a);
  }
}
