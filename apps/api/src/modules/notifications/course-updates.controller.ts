import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CourseUpdateInput } from '@tk/contracts';
import { Audiences, RequirePermissions } from '../../common/auth/auth-context.js';
import { ApiZodBody, ZodBody } from '../../common/validation/zod.js';
import { StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { CourseUpdatesService } from './course-updates.service.js';

const uuid = () => new ParseUUIDPipe();

/** "Notify students" on a course page (D-060). */
@ApiTags('admin-courses')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin/courses/:id/updates')
export class CourseUpdatesController {
  constructor(private readonly updates: CourseUpdatesService) {}

  @Get()
  @RequirePermissions('courses:notify')
  list(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.updates.list(id, a);
  }

  @Post()
  @RequirePermissions('courses:notify')
  @ApiZodBody(CourseUpdateInput)
  send(
    @Param('id', uuid()) id: string,
    @ZodBody(CourseUpdateInput) body: CourseUpdateInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.updates.send(id, body, a);
  }
}
