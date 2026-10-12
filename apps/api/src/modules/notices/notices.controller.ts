import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminNoticeQuery, CursorQuery, NoticeInput, NoticeStatusInput } from '@tk/contracts';
import {
  Audiences,
  CurrentAuth,
  RequirePermissions,
  type AuthContext,
} from '../../common/auth/auth-context.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import type { FastifyReply } from 'fastify';
import { StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { NoticesService } from './notices.service.js';

const uuid = () => new ParseUUIDPipe();

/** The Notice tab (D-019): live notices for signed-in students, and the "new" badge. */
@ApiTags('notices')
@ApiBearerAuth()
@Audiences('student')
@Controller()
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Get('notices')
  list(@ZodQuery(CursorQuery) query: CursorQuery) {
    return this.notices.live(query);
  }

  @Get('notices/:id')
  detail(@Param('id', uuid()) id: string) {
    return this.notices.detail(id);
  }

  /** A PDF attached to a live notice (D-074 / audit F-12). */
  @Get('notices/:id/attachments/:mediaId')
  @RateLimit({ name: 'notices.attachment', limit: 120, windowSeconds: 3600, by: ['user'] })
  async attachment(
    @Param('id', uuid()) id: string,
    @Param('mediaId', uuid()) mediaId: string,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.notices.attachment(id, mediaId);
    void reply
      .header('Content-Type', 'application/pdf')
      .header('Cache-Control', 'private, no-store')
      .header('Content-Disposition', `inline; filename="${file.filename}"`)
      .send(file.body);
  }

  @Get('me/notices/unseen')
  async unseen(@CurrentAuth() auth: AuthContext) {
    return { count: await this.notices.unseen(auth.userId) };
  }

  @Post('me/notices/seen')
  @HttpCode(204)
  async seen(@CurrentAuth() auth: AuthContext) {
    await this.notices.markSeen(auth.userId);
  }
}

/** Notices in the CMS: `notices:edit` writes, `notices:publish` publishes (D-036). */
@ApiTags('admin-notices')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin/notices')
export class AdminNoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Get()
  @RequirePermissions('notices:edit')
  list(@ZodQuery(AdminNoticeQuery) query: AdminNoticeQuery) {
    return this.notices.list(query);
  }

  @Post()
  @RequirePermissions('notices:edit')
  @ApiZodBody(NoticeInput)
  create(@ZodBody(NoticeInput) body: NoticeInput, @StaffActor() a: ContentActor) {
    return this.notices.create(body, a);
  }

  @Get(':id')
  @RequirePermissions('notices:edit')
  detail(@Param('id', uuid()) id: string) {
    return this.notices.adminDetail(id);
  }

  @Put(':id')
  @RequirePermissions('notices:edit')
  @ApiZodBody(NoticeInput)
  update(
    @Param('id', uuid()) id: string,
    @ZodBody(NoticeInput) body: NoticeInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.notices.update(id, body, a);
  }

  @Put(':id/status')
  @RequirePermissions('notices:edit')
  @ApiZodBody(NoticeStatusInput)
  status(
    @Param('id', uuid()) id: string,
    @ZodBody(NoticeStatusInput) body: NoticeStatusInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.notices.setStatus(id, body, a);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('notices:edit')
  async remove(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.notices.remove(id, a);
  }
}
