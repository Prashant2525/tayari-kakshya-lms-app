import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Audiences, CurrentAuth, Public, type AuthContext } from '../../common/auth/auth-context.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { CertificatesService } from './certificates.service.js';

/** Certificates (D-049, D-050): the student's own, and public verification by certificate number. */
@ApiTags('certificates')
@Controller()
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get('me/certificates')
  @ApiBearerAuth()
  @Audiences('student')
  @Header('Cache-Control', 'private, no-store')
  mine(@CurrentAuth() auth: AuthContext) {
    return this.certificates.mine(auth.userId);
  }

  /** Anyone holding a certificate number can check it (dashes, case and O/0, I/1 do not matter). */
  @Public()
  @Get('certificates/:code')
  @Header('Cache-Control', 'no-store')
  @RateLimit({ name: 'certificates.verify', limit: 120, windowSeconds: 3600, by: ['ip'] })
  verify(@Param('code') code: string) {
    return this.certificates.verify(code);
  }

  @Public()
  @Get('certificates/:code/pdf')
  @RateLimit({ name: 'certificates.pdf', limit: 60, windowSeconds: 3600, by: ['ip'] })
  async pdf(@Param('code') code: string, @Res() reply: FastifyReply) {
    const file = await this.certificates.pdf(code);
    void reply
      .header('Content-Type', 'application/pdf')
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', `inline; filename="${file.filename}"`)
      .send(file.body);
  }
}
