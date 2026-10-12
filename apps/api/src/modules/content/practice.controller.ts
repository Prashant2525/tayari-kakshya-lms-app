import { Controller, Delete, Get, HttpCode, Param, ParseEnumPipe, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BookmarkTarget, type Platform, PracticeQuery, PyqQuery, SearchQuery } from '@tk/contracts';
import { Audiences, CurrentAuth, type AuthContext } from '../../common/auth/auth-context.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ZodQuery } from '../../common/validation/zod.js';
import { PracticeService } from './practice.service.js';
import { ClientPlatform } from './request-helpers.js';

const uuid = () => new ParseUUIDPipe();
const target = () => new ParseEnumPipe(BookmarkTarget.enum);

/** Practice questions, bookmarks and search for signed-in students. */
@ApiTags('learning')
@ApiBearerAuth()
@Audiences('student')
@Controller()
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}

  @Get('courses/:courseId/subjects/:subjectId/questions')
  questions(
    @Param('courseId', uuid()) courseId: string,
    @Param('subjectId', uuid()) subjectId: string,
    @ZodQuery(PracticeQuery) query: PracticeQuery,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.practice.subjectQuestions(courseId, subjectId, { userId: auth.userId }, query);
  }

  @Get('pyq')
  pyq(@ZodQuery(PyqQuery) query: PyqQuery, @CurrentAuth() auth: AuthContext) {
    return this.practice.pyq({ userId: auth.userId }, query);
  }

  @Get('pyq/filters')
  pyqFilters() {
    return this.practice.pyqFilters();
  }

  @Get('practice-questions/:id')
  question(@Param('id', uuid()) id: string, @CurrentAuth() auth: AuthContext) {
    return this.practice.question(id, { userId: auth.userId });
  }

  @Get('me/bookmarks')
  bookmarks(@CurrentAuth() auth: AuthContext) {
    return this.practice.bookmarks(auth.userId);
  }

  @Put('me/bookmarks/:type/:id')
  @HttpCode(204)
  @RateLimit({ name: 'learning.bookmarks', limit: 300, windowSeconds: 3600, by: ['user'] })
  async addBookmark(
    @Param('type', target()) type: BookmarkTarget,
    @Param('id', uuid()) id: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    await this.practice.addBookmark(auth.userId, type, id);
  }

  @Delete('me/bookmarks/:type/:id')
  @HttpCode(204)
  async removeBookmark(
    @Param('type', target()) type: BookmarkTarget,
    @Param('id', uuid()) id: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    await this.practice.removeBookmark(auth.userId, type, id);
  }

  @Get('search')
  @RateLimit({ name: 'learning.search', limit: 120, windowSeconds: 60, by: ['user'] })
  search(@ZodQuery(SearchQuery) query: SearchQuery, @ClientPlatform() platform: Platform) {
    return this.practice.search(query.q, platform);
  }
}
