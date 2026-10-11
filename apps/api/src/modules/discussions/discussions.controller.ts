import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AdminDiscussionQuery,
  CursorQuery,
  DiscussionBanInput,
  DiscussionPostInput,
  DiscussionTarget,
  HidePostInput,
  ReportPostInput,
} from '@tk/contracts';
import {
  Audiences,
  CurrentAuth,
  RequirePermissions,
  type AuthContext,
} from '../../common/auth/auth-context.js';
import { Errors } from '../../common/errors/app-error.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { DiscussionsService } from './discussions.service.js';

const uuid = () => new ParseUUIDPipe();
/** `question` or `lesson`; anything else is not a discussion. */
const target = (value: string): DiscussionTarget => {
  const parsed = DiscussionTarget.safeParse(value);
  if (!parsed.success) throw Errors.notFound('Discussion');
  return parsed.data;
};

/** Discussions under questions and lessons, for students (S12, D-066). */
@ApiTags('discussions')
@ApiBearerAuth()
@Audiences('student')
@Controller('discussions')
export class DiscussionsController {
  constructor(private readonly discussions: DiscussionsService) {}

  @Get(':target/:targetId')
  thread(
    @Param('target') t: string,
    @Param('targetId', uuid()) targetId: string,
    @ZodQuery(CursorQuery) query: CursorQuery,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.discussions.thread(auth.userId, target(t), targetId, query);
  }

  @Post(':target/:targetId/posts')
  @RateLimit({ name: 'discussions.post', limit: 30, windowSeconds: 3600, by: ['user'] })
  @ApiZodBody(DiscussionPostInput)
  post(
    @Param('target') t: string,
    @Param('targetId', uuid()) targetId: string,
    @ZodBody(DiscussionPostInput) body: DiscussionPostInput,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.discussions.post(auth.userId, target(t), targetId, body);
  }

  @Delete('posts/:id')
  @HttpCode(204)
  async remove(@Param('id', uuid()) id: string, @CurrentAuth() auth: AuthContext) {
    await this.discussions.removeOwn(auth.userId, id);
  }

  @Post('posts/:id/report')
  @HttpCode(204)
  @RateLimit({ name: 'discussions.report', limit: 30, windowSeconds: 3600, by: ['user'] })
  @ApiZodBody(ReportPostInput)
  async report(
    @Param('id', uuid()) id: string,
    @ZodBody(ReportPostInput) body: ReportPostInput,
    @CurrentAuth() auth: AuthContext,
  ) {
    await this.discussions.report(auth.userId, id, body);
  }
}

/** Moderation and teachers' answers in the CMS. */
@ApiTags('admin-discussions')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin/discussions')
export class AdminDiscussionsController {
  constructor(private readonly discussions: DiscussionsService) {}

  @Get()
  @RequirePermissions('discussions:moderate')
  list(@ZodQuery(AdminDiscussionQuery) query: AdminDiscussionQuery) {
    return this.discussions.adminList(query);
  }

  @Get(':target/:targetId')
  @RequirePermissions('discussions:moderate')
  thread(
    @Param('target') t: string,
    @Param('targetId', uuid()) targetId: string,
    @ZodQuery(CursorQuery) query: CursorQuery,
  ) {
    return this.discussions.adminThread(target(t), targetId, query);
  }

  @Post(':target/:targetId/posts')
  @RequirePermissions('discussions:moderate')
  @ApiZodBody(DiscussionPostInput)
  post(
    @Param('target') t: string,
    @Param('targetId', uuid()) targetId: string,
    @ZodBody(DiscussionPostInput) body: DiscussionPostInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.discussions.staffPost(a, target(t), targetId, body);
  }

  @Post('posts/:id/hide')
  @HttpCode(200)
  @RequirePermissions('discussions:moderate')
  @ApiZodBody(HidePostInput)
  hide(
    @Param('id', uuid()) id: string,
    @ZodBody(HidePostInput) body: HidePostInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.discussions.hide(id, body.reason, a);
  }

  @Post('posts/:id/unhide')
  @HttpCode(200)
  @RequirePermissions('discussions:moderate')
  unhide(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.discussions.unhide(id, a);
  }

  @Post('posts/:id/dismiss-reports')
  @HttpCode(204)
  @RequirePermissions('discussions:moderate')
  async dismiss(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.discussions.dismissReports(id, a);
  }

  @Put('posts/:id/best')
  @RequirePermissions('discussions:moderate')
  best(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.discussions.setBest(id, true, a);
  }

  @Delete('posts/:id/best')
  @RequirePermissions('discussions:moderate')
  clearBest(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.discussions.setBest(id, false, a);
  }

  @Put('bans/:userId')
  @HttpCode(204)
  @RequirePermissions('discussions:moderate')
  @ApiZodBody(DiscussionBanInput)
  async ban(
    @Param('userId', uuid()) userId: string,
    @ZodBody(DiscussionBanInput) body: DiscussionBanInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.discussions.ban(userId, body, a);
  }

  @Delete('bans/:userId')
  @HttpCode(204)
  @RequirePermissions('discussions:moderate')
  async unban(@Param('userId', uuid()) userId: string, @StaffActor() a: ContentActor) {
    await this.discussions.unban(userId, a);
  }
}
