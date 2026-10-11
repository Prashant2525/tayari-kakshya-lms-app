import { Controller, Get, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AnalyticsRange, type ExportKind } from '@tk/contracts';
import type { FastifyReply } from 'fastify';
import { Audiences, RequirePermissions } from '../../common/auth/auth-context.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ZodQuery } from '../../common/validation/zod.js';
import { StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { AnalyticsService } from './analytics.service.js';
import { ExportsService } from './exports.service.js';

/**
 * Dashboards (Phase 13e, D-066): each one needs the permission that already shows its data — orders for sales,
 * students for students, courses for learning, assessments for tests.
 */
@ApiTags('admin-analytics')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('sales')
  @RequirePermissions('orders:read')
  sales(@ZodQuery(AnalyticsRange) range: AnalyticsRange) {
    return this.analytics.sales(range);
  }

  @Get('students')
  @RequirePermissions('users:read')
  students(@ZodQuery(AnalyticsRange) range: AnalyticsRange) {
    return this.analytics.students(range);
  }

  @Get('learning')
  @RequirePermissions('courses:edit')
  learning(@ZodQuery(AnalyticsRange) range: AnalyticsRange) {
    return this.analytics.learning(range);
  }

  @Get('tests')
  @RequirePermissions('assessments:edit')
  tests(@ZodQuery(AnalyticsRange) range: AnalyticsRange) {
    return this.analytics.tests(range);
  }
}

/** CSV downloads (D-066), audited; the same permissions as the matching dashboard. */
@ApiTags('admin-exports')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin/exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get('orders.csv')
  @RequirePermissions('orders:read')
  @RateLimit({ name: 'exports', limit: 60, windowSeconds: 3600, by: ['user'] })
  orders(
    @ZodQuery(AnalyticsRange) range: AnalyticsRange,
    @StaffActor() a: ContentActor,
    @Res() reply: FastifyReply,
  ) {
    return this.send('orders', range, a, reply);
  }

  @Get('students.csv')
  @RequirePermissions('users:read')
  @RateLimit({ name: 'exports', limit: 60, windowSeconds: 3600, by: ['user'] })
  students(
    @ZodQuery(AnalyticsRange) range: AnalyticsRange,
    @StaffActor() a: ContentActor,
    @Res() reply: FastifyReply,
  ) {
    return this.send('students', range, a, reply);
  }

  @Get('enrolments.csv')
  @RequirePermissions('users:read')
  @RateLimit({ name: 'exports', limit: 60, windowSeconds: 3600, by: ['user'] })
  enrolments(
    @ZodQuery(AnalyticsRange) range: AnalyticsRange,
    @StaffActor() a: ContentActor,
    @Res() reply: FastifyReply,
  ) {
    return this.send('enrolments', range, a, reply);
  }

  @Get('test-results.csv')
  @RequirePermissions('assessments:edit')
  @RateLimit({ name: 'exports', limit: 60, windowSeconds: 3600, by: ['user'] })
  testResults(
    @ZodQuery(AnalyticsRange) range: AnalyticsRange,
    @StaffActor() a: ContentActor,
    @Res() reply: FastifyReply,
  ) {
    return this.send('test-results', range, a, reply);
  }

  private async send(kind: ExportKind, range: AnalyticsRange, actor: ContentActor, reply: FastifyReply) {
    const file = await this.exports.export(kind, range, actor);
    void reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Cache-Control', 'private, no-store')
      .header('Content-Disposition', `attachment; filename="${file.filename}"`)
      .header('X-Export-Rows', String(file.rows))
      .header('X-Export-Truncated', String(file.truncated))
      .send(file.body);
  }
}
