import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CourseInterestContactInput, CourseInterestQuery } from '@tk/contracts';
import { Audiences, RequirePermissions } from '../../common/auth/auth-context.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { CourseInterestsService } from './course-interests.service.js';

const uuid = () => new ParseUUIDPipe();

/** Students on Apple devices interested in courses they cannot buy in the app (D-061). */
@ApiTags('admin-sales')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin/course-interests')
export class CourseInterestsController {
  constructor(private readonly interests: CourseInterestsService) {}

  @Get()
  @RequirePermissions('interests:manage')
  list(@ZodQuery(CourseInterestQuery) query: CourseInterestQuery) {
    return this.interests.list(query);
  }

  @Get(':id/email')
  @RequirePermissions('interests:manage')
  draft(@Param('id', uuid()) id: string) {
    return this.interests.draft(id);
  }

  @Post(':id/contact')
  @HttpCode(200)
  @RequirePermissions('interests:manage')
  @ApiZodBody(CourseInterestContactInput)
  contact(
    @Param('id', uuid()) id: string,
    @ZodBody(CourseInterestContactInput) body: CourseInterestContactInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.interests.contact(id, body, a);
  }
}
