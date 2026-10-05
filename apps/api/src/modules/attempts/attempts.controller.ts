import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CursorQuery, SaveAnswersInput, SelfGradeInput, StudentAssessmentQuery } from '@tk/contracts';
import { Audiences, CurrentAuth, type AuthContext } from '../../common/auth/auth-context.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { AttemptsService } from './attempts.service.js';

const uuid = () => new ParseUUIDPipe();

/** Students taking assessments (§10): list, rules, start/resume, autosave, submit, results, history. */
@ApiTags('assessments')
@ApiBearerAuth()
@Audiences('student')
@Controller()
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Get('assessments')
  list(@ZodQuery(StudentAssessmentQuery) query: StudentAssessmentQuery, @CurrentAuth() auth: AuthContext) {
    return this.attempts.list(query, { userId: auth.userId });
  }

  /** Today's daily challenge (Nepal day) and the student's streak. */
  @Get('daily-challenge/today')
  dailyToday(@CurrentAuth() auth: AuthContext) {
    return this.attempts.dailyToday({ userId: auth.userId });
  }

  @Get('daily-challenges')
  dailyPast(@ZodQuery(CursorQuery) query: CursorQuery, @CurrentAuth() auth: AuthContext) {
    return this.attempts.dailyPast({ userId: auth.userId }, query.cursor, query.limit);
  }

  @Get('me/streak')
  streak(@CurrentAuth() auth: AuthContext) {
    return this.attempts.streak({ userId: auth.userId });
  }

  @Get('assessments/:id/leaderboard')
  leaderboard(@Param('id', uuid()) id: string, @CurrentAuth() auth: AuthContext) {
    return this.attempts.leaderboard(id, { userId: auth.userId });
  }

  @Get('assessments/:id')
  detail(@Param('id', uuid()) id: string, @CurrentAuth() auth: AuthContext) {
    return this.attempts.detail(id, { userId: auth.userId });
  }

  /** Starts an attempt, or resumes the unfinished one. */
  @Post('assessments/:id/attempts')
  @HttpCode(200)
  @RateLimit({ name: 'attempts.start', limit: 60, windowSeconds: 3600, by: ['user'] })
  start(@Param('id', uuid()) id: string, @CurrentAuth() auth: AuthContext) {
    return this.attempts.start(id, { userId: auth.userId });
  }

  @Get('attempts/:id')
  view(@Param('id', uuid()) id: string, @CurrentAuth() auth: AuthContext) {
    return this.attempts.view(id, { userId: auth.userId });
  }

  @Put('attempts/:id/answers')
  @ApiZodBody(SaveAnswersInput)
  @RateLimit({ name: 'attempts.save', limit: 1200, windowSeconds: 3600, by: ['user'] })
  save(
    @Param('id', uuid()) id: string,
    @ZodBody(SaveAnswersInput) input: SaveAnswersInput,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.attempts.saveAnswers(id, input, { userId: auth.userId });
  }

  @Post('attempts/:id/submit')
  @HttpCode(200)
  submit(@Param('id', uuid()) id: string, @CurrentAuth() auth: AuthContext) {
    return this.attempts.submit(id, { userId: auth.userId });
  }

  @Get('attempts/:id/result')
  result(@Param('id', uuid()) id: string, @CurrentAuth() auth: AuthContext) {
    return this.attempts.result(id, { userId: auth.userId });
  }

  @Post('attempts/:id/self-grade')
  @HttpCode(200)
  @ApiZodBody(SelfGradeInput)
  selfGrade(
    @Param('id', uuid()) id: string,
    @ZodBody(SelfGradeInput) input: SelfGradeInput,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.attempts.selfGrade(id, input, { userId: auth.userId });
  }

  @Get('me/attempts')
  history(@ZodQuery(CursorQuery) query: CursorQuery, @CurrentAuth() auth: AuthContext) {
    return this.attempts.history({ userId: auth.userId }, query.cursor, query.limit);
  }
}
