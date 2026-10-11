import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StudyPlanInput } from '@tk/contracts';
import { Audiences, CurrentAuth, type AuthContext } from '../../common/auth/auth-context.js';
import { ApiZodBody, ZodBody } from '../../common/validation/zod.js';
import { PlannerService } from './planner.service.js';

const uuid = () => new ParseUUIDPipe();

/** The student's study plans (S7, D-066): one per course they have. */
@ApiTags('planner')
@ApiBearerAuth()
@Audiences('student')
@Controller('me/study-plans')
export class PlannerController {
  constructor(private readonly planner: PlannerService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.planner.list(auth.userId);
  }

  @Get(':courseId')
  get(@Param('courseId', uuid()) courseId: string, @CurrentAuth() auth: AuthContext) {
    return this.planner.get(auth.userId, courseId);
  }

  /** Creates or changes the plan for this course. */
  @Put(':courseId')
  @ApiZodBody(StudyPlanInput)
  save(
    @Param('courseId', uuid()) courseId: string,
    @ZodBody(StudyPlanInput) body: StudyPlanInput,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.planner.save(auth.userId, courseId, body);
  }

  @Delete(':courseId')
  @HttpCode(204)
  async remove(@Param('courseId', uuid()) courseId: string, @CurrentAuth() auth: AuthContext) {
    await this.planner.remove(auth.userId, courseId);
  }
}
