import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CursorQuery,
  PublishStatus,
  QuestionGroupInput,
  QuestionInput,
  QuestionListQuery,
  QuestionReportInput,
  ResolveReportInput,
} from '@tk/contracts';
import { z } from 'zod';
import {
  Audiences,
  CurrentAuth,
  RequireAnyPermission,
  RequirePermissions,
  type AuthContext,
} from '../../common/auth/auth-context.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { QuestionReportsService } from './question-reports.service.js';
import { QuestionsService } from './questions.service.js';

const StatusInput = z.object({ status: PublishStatus });
const ReportsQuery = CursorQuery.extend({
  cursor: z.uuid().optional(),
  status: z.enum(['open', 'resolved', 'rejected']).default('open'),
});
const uuid = () => new ParseUUIDPipe();

/** Question bank administration. Publishing rules and staff scopes are checked in the service. */
@ApiTags('admin-questions')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin')
export class AdminQuestionsController {
  constructor(
    private readonly questions: QuestionsService,
    private readonly reports: QuestionReportsService,
  ) {}

  @Get('questions')
  @RequireAnyPermission('questions:edit', 'questions:publish', 'assessments:edit')
  list(@ZodQuery(QuestionListQuery) query: QuestionListQuery, @StaffActor() a: ContentActor) {
    return this.questions.list(query, a);
  }

  @Post('questions')
  @RequirePermissions('questions:edit')
  @ApiZodBody(QuestionInput)
  create(@ZodBody(QuestionInput) body: QuestionInput, @StaffActor() a: ContentActor) {
    return this.questions.create(body, a);
  }

  @Get('questions/:id')
  @RequireAnyPermission('questions:edit', 'questions:publish', 'assessments:edit')
  get(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.questions.get(id, a);
  }

  @Put('questions/:id')
  @RequirePermissions('questions:edit')
  @ApiZodBody(QuestionInput)
  update(
    @Param('id', uuid()) id: string,
    @ZodBody(QuestionInput) body: QuestionInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.questions.update(id, body, a);
  }

  @Get('questions/:id/versions')
  @RequireAnyPermission('questions:edit', 'questions:publish')
  versions(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.questions.versions(id, a);
  }

  @Put('questions/:id/status')
  @HttpCode(204)
  @RequirePermissions('questions:edit')
  @ApiZodBody(StatusInput)
  async status(
    @Param('id', uuid()) id: string,
    @ZodBody(StatusInput) body: z.infer<typeof StatusInput>,
    @StaffActor() a: ContentActor,
  ) {
    await this.questions.setStatus(id, body.status, a);
  }

  @Delete('questions/:id')
  @HttpCode(204)
  @RequirePermissions('questions:edit')
  async remove(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.questions.remove(id, a);
  }

  @Post('questions/:id/restore')
  @HttpCode(204)
  @RequirePermissions('questions:edit')
  async restore(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.questions.restore(id, a);
  }

  @Get('question-tags')
  @RequireAnyPermission('questions:edit', 'questions:publish', 'assessments:edit')
  tags(@Query('q') q?: string) {
    return this.questions.tags(q?.trim().slice(0, 50) || undefined);
  }

  @Get('question-groups')
  @RequireAnyPermission('questions:edit', 'questions:publish')
  groups(@Query('q') q?: string) {
    return this.questions.listGroups(q?.trim().slice(0, 120) || undefined);
  }

  @Post('question-groups')
  @RequirePermissions('questions:edit')
  @ApiZodBody(QuestionGroupInput)
  createGroup(
    @ZodBody(QuestionGroupInput) body: z.infer<typeof QuestionGroupInput>,
    @StaffActor() a: ContentActor,
  ) {
    return this.questions.saveGroup(null, body, a);
  }

  @Put('question-groups/:id')
  @RequirePermissions('questions:edit')
  @ApiZodBody(QuestionGroupInput)
  updateGroup(
    @Param('id', uuid()) id: string,
    @ZodBody(QuestionGroupInput) body: z.infer<typeof QuestionGroupInput>,
    @StaffActor() a: ContentActor,
  ) {
    return this.questions.saveGroup(id, body, a);
  }

  @Get('question-reports')
  @RequirePermissions('question_reports:manage')
  listReports(@ZodQuery(ReportsQuery) query: z.infer<typeof ReportsQuery>) {
    return this.reports.list(query.status, query.cursor, query.limit);
  }

  @Put('question-reports/:id')
  @HttpCode(204)
  @RequirePermissions('question_reports:manage')
  @ApiZodBody(ResolveReportInput)
  async resolveReport(
    @Param('id', uuid()) id: string,
    @ZodBody(ResolveReportInput) body: z.infer<typeof ResolveReportInput>,
    @StaffActor() a: ContentActor,
  ) {
    await this.reports.resolve(id, body, a.userId, a.client);
  }
}

/** Students report a problem with a question they saw. */
@ApiTags('learning')
@ApiBearerAuth()
@Audiences('student')
@Controller()
export class QuestionReportsController {
  constructor(private readonly reports: QuestionReportsService) {}

  @Post('questions/:id/reports')
  @RateLimit({ name: 'questions.report', limit: 20, windowSeconds: 3600, by: ['user'] })
  @ApiZodBody(QuestionReportInput)
  report(
    @Param('id', uuid()) id: string,
    @ZodBody(QuestionReportInput) body: z.infer<typeof QuestionReportInput>,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.reports.report(id, auth.userId, body);
  }
}
