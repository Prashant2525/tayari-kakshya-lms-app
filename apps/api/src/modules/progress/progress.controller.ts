import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StudyTimeInput } from '@tk/contracts';
import { Audiences, CurrentAuth, type AuthContext } from '../../common/auth/auth-context.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ApiZodBody, ZodBody } from '../../common/validation/zod.js';
import { ProgressService } from './progress.service.js';

/** The student's own progress analytics and study time (S8, D-066). */
@ApiTags('progress')
@ApiBearerAuth()
@Audiences('student')
@Controller('me')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  /** Adds measured study time (never more than the time since the previous report). */
  @Post('study-time')
  @HttpCode(200)
  @RateLimit({ name: 'progress.studyTime', limit: 240, windowSeconds: 3600, by: ['user'] })
  @ApiZodBody(StudyTimeInput)
  studyTime(@ZodBody(StudyTimeInput) body: StudyTimeInput, @CurrentAuth() auth: AuthContext) {
    return this.progress.recordStudyTime(auth.userId, body);
  }

  @Get('progress')
  summary(@CurrentAuth() auth: AuthContext) {
    return this.progress.summary(auth.userId);
  }
}
