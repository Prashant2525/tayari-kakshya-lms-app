import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MistakeReviewInput, MistakesQuery, PracticeCheckInput } from '@tk/contracts';
import { Audiences, CurrentAuth, type AuthContext } from '../../common/auth/auth-context.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { MistakesService } from './mistakes.service.js';

const uuid = () => new ParseUUIDPipe();

/** Practice answers and the mistake notebook with revision (D-050). */
@ApiTags('mistakes')
@ApiBearerAuth()
@Audiences('student')
@Controller()
export class MistakesController {
  constructor(private readonly mistakes: MistakesService) {}

  /** Records a checked practice answer (scored on the server); wrong or partly correct joins the notebook. */
  @Post('practice-questions/:id/check')
  @HttpCode(200)
  @RateLimit({ name: 'practice.check', limit: 600, windowSeconds: 3600, by: ['user'] })
  @ApiZodBody(PracticeCheckInput)
  check(
    @Param('id', uuid()) id: string,
    @ZodBody(PracticeCheckInput) body: PracticeCheckInput,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.mistakes.checkPractice(id, body, { userId: auth.userId });
  }

  @Get('me/mistakes')
  list(@ZodQuery(MistakesQuery) query: MistakesQuery, @CurrentAuth() auth: AuthContext) {
    return this.mistakes.list(query, { userId: auth.userId });
  }

  @Get('me/mistakes/summary')
  summary(@CurrentAuth() auth: AuthContext) {
    return this.mistakes.summary({ userId: auth.userId });
  }

  @Post('me/mistakes/:questionId/review')
  @HttpCode(200)
  @RateLimit({ name: 'mistakes.review', limit: 600, windowSeconds: 3600, by: ['user'] })
  @ApiZodBody(MistakeReviewInput)
  review(
    @Param('questionId', uuid()) questionId: string,
    @ZodBody(MistakeReviewInput) body: MistakeReviewInput,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.mistakes.review(questionId, body, { userId: auth.userId });
  }

  @Delete('me/mistakes/:questionId')
  @HttpCode(204)
  async remove(@Param('questionId', uuid()) questionId: string, @CurrentAuth() auth: AuthContext) {
    await this.mistakes.remove(questionId, { userId: auth.userId });
  }
}
