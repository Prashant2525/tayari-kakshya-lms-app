import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Audiences, RequireAnyPermission } from '../../common/auth/auth-context.js';
import { QaService } from './qa.service.js';
import { StaffActor } from './request-helpers.js';
import type { ContentActor } from './scope.service.js';

const uuid = () => new ParseUUIDPipe();

/** Content QA (S23, D-075 / audit F-04): checklists before publishing and the student's view of a test. */
@ApiTags('admin-qa')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin')
export class QaController {
  constructor(private readonly qa: QaService) {}

  @Get('learning-items/:id/checklist')
  @RequireAnyPermission('content:edit', 'content:publish')
  itemChecklist(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.qa.itemChecklist(id, a);
  }

  @Get('courses/:id/checklist')
  @RequireAnyPermission('courses:edit', 'courses:publish', 'courses:pricing')
  courseChecklist(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.qa.courseChecklist(id, a);
  }

  /** Answer keys and explanations are left out, as for a student taking it. */
  @Get('assessments/:id/preview')
  @Header('Cache-Control', 'private, no-store')
  @RequireAnyPermission('assessments:edit', 'assessments:publish')
  assessmentPreview(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.qa.assessmentPreview(id, a);
  }
}
