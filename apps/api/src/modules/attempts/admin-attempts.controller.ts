import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CursorQuery, GradeAnswerInput, GradingQueueQuery } from '@tk/contracts';
import { Audiences, RequireAnyPermission, RequirePermissions } from '../../common/auth/auth-context.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { AdminAttemptsService } from './admin-attempts.service.js';

const uuid = () => new ParseUUIDPipe();

/** Grading queue, results per assessment, attempt detail and manual release (§10 part 2). */
@ApiTags('admin-attempts')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin')
export class AdminAttemptsController {
  constructor(private readonly attempts: AdminAttemptsService) {}

  @Get('grading')
  @RequirePermissions('grading:manage')
  queue(@ZodQuery(GradingQueueQuery) query: GradingQueueQuery, @StaffActor() a: ContentActor) {
    return this.attempts.queue(query, a);
  }

  @Put('attempts/:attemptId/answers/:questionId/grade')
  @RequirePermissions('grading:manage')
  @ApiZodBody(GradeAnswerInput)
  grade(
    @Param('attemptId', uuid()) attemptId: string,
    @Param('questionId', uuid()) questionId: string,
    @ZodBody(GradeAnswerInput) body: GradeAnswerInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.attempts.grade(attemptId, questionId, body, a);
  }

  @Get('assessments/:id/attempts')
  @RequireAnyPermission('assessments:edit', 'assessments:publish', 'grading:manage')
  results(
    @Param('id', uuid()) id: string,
    @ZodQuery(CursorQuery) q: CursorQuery,
    @StaffActor() a: ContentActor,
  ) {
    return this.attempts.results(id, a, q.cursor, q.limit);
  }

  @Get('assessments/:id/leaderboard')
  @RequireAnyPermission('assessments:edit', 'assessments:publish', 'grading:manage')
  leaderboard(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.attempts.leaderboard(id, a);
  }

  @Get('attempts/:id')
  @RequireAnyPermission('assessments:edit', 'assessments:publish', 'grading:manage')
  attempt(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.attempts.attempt(id, a);
  }

  @Post('assessments/:id/release-results')
  @HttpCode(200)
  @RequirePermissions('assessments:publish')
  release(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.attempts.release(id, a);
  }
}
