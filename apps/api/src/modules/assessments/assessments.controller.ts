import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AssessmentInput,
  AssessmentListQuery,
  AssessmentStructureInput,
  StatusChangeInput,
} from '@tk/contracts';
import { Audiences, RequireAnyPermission, RequirePermissions } from '../../common/auth/auth-context.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { AssessmentsService } from './assessments.service.js';

const uuid = () => new ParseUUIDPipe();

/** Quizzes, tests, weekly / mock / PYQ exams and daily challenges (D-021). */
@ApiTags('admin-assessments')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin')
export class AdminAssessmentsController {
  constructor(
    private readonly assessments: AssessmentsService,
    private readonly settings: SettingsService,
  ) {}

  @Get('assessments')
  @RequireAnyPermission('assessments:edit', 'assessments:publish')
  list(@ZodQuery(AssessmentListQuery) query: AssessmentListQuery, @StaffActor() a: ContentActor) {
    return this.assessments.list(query, a);
  }

  @Post('assessments')
  @RequirePermissions('assessments:edit')
  @ApiZodBody(AssessmentInput)
  create(@ZodBody(AssessmentInput) body: AssessmentInput, @StaffActor() a: ContentActor) {
    return this.assessments.create(body, a);
  }

  /** Prefill for new assessments (setting `assessments.defaults`); unset scoring choices come back as null. */
  @Get('assessments/defaults')
  @RequirePermissions('assessments:edit')
  defaults() {
    return this.settings.get('assessments.defaults');
  }

  @Get('assessments/:id')
  @RequireAnyPermission('assessments:edit', 'assessments:publish')
  get(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.assessments.get(id, a);
  }

  @Put('assessments/:id')
  @RequirePermissions('assessments:edit')
  @ApiZodBody(AssessmentInput)
  update(
    @Param('id', uuid()) id: string,
    @ZodBody(AssessmentInput) body: AssessmentInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.assessments.update(id, body, a);
  }

  @Put('assessments/:id/structure')
  @RequirePermissions('assessments:edit')
  @ApiZodBody(AssessmentStructureInput)
  structure(
    @Param('id', uuid()) id: string,
    @ZodBody(AssessmentStructureInput) body: AssessmentStructureInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.assessments.setStructure(id, body, a);
  }

  @Put('assessments/:id/publishing')
  @HttpCode(204)
  @RequirePermissions('assessments:edit')
  @ApiZodBody(StatusChangeInput)
  async publishing(
    @Param('id', uuid()) id: string,
    @ZodBody(StatusChangeInput) body: StatusChangeInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.assessments.setStatus(id, body, a);
  }

  @Delete('assessments/:id')
  @HttpCode(204)
  @RequirePermissions('assessments:edit')
  async remove(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.assessments.remove(id, a);
  }
}
