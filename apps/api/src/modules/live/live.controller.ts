import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminLiveClassQuery, LiveClassInput, LiveClassQuery, LiveRecordingInput } from '@tk/contracts';
import type { FastifyReply } from 'fastify';
import {
  Audiences,
  CurrentAuth,
  RequirePermissions,
  type AuthContext,
} from '../../common/auth/auth-context.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { LiveService } from './live.service.js';

const uuid = () => new ParseUUIDPipe();

/** Live classes for students (S22, D-072). */
@ApiTags('live-classes')
@ApiBearerAuth()
@Audiences('student')
@Controller('live-classes')
export class LiveController {
  constructor(private readonly live: LiveService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@ZodQuery(LiveClassQuery) query: LiveClassQuery, @CurrentAuth() auth: AuthContext) {
    return this.live.list(auth.userId, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  get(@Param('id', uuid()) id: string, @CurrentAuth() auth: AuthContext) {
    return this.live.get(auth.userId, id);
  }

  /** The link to the class (and attendance), only for students who may join, while it is open. */
  @Post(':id/join')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @RateLimit({ name: 'live.join', limit: 60, windowSeconds: 3600, by: ['user'] })
  join(@Param('id', uuid()) id: string, @CurrentAuth() auth: AuthContext) {
    return this.live.join(auth.userId, id);
  }

  @Get(':id/recording')
  @Header('Cache-Control', 'private, no-store')
  @RateLimit({ name: 'learning.playback', limit: 300, windowSeconds: 3600, by: ['user'] })
  recording(@Param('id', uuid()) id: string, @CurrentAuth() auth: AuthContext) {
    return this.live.recording(auth.userId, id);
  }
}

/** Scheduling and running live classes in the CMS (D-072). */
@ApiTags('admin-live-classes')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin/live-classes')
export class AdminLiveController {
  constructor(private readonly live: LiveService) {}

  @Get()
  @RequirePermissions('live:manage')
  list(@ZodQuery(AdminLiveClassQuery) query: AdminLiveClassQuery, @StaffActor() a: ContentActor) {
    return this.live.adminList(query, a);
  }

  @Post()
  @RequirePermissions('live:manage')
  @ApiZodBody(LiveClassInput)
  create(@ZodBody(LiveClassInput) body: LiveClassInput, @StaffActor() a: ContentActor) {
    return this.live.create(body, a);
  }

  @Get(':id')
  @RequirePermissions('live:manage')
  get(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.live.adminGet(id, a);
  }

  @Put(':id')
  @RequirePermissions('live:manage')
  @ApiZodBody(LiveClassInput)
  update(
    @Param('id', uuid()) id: string,
    @ZodBody(LiveClassInput) body: LiveClassInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.live.update(id, body, a);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermissions('live:manage')
  publish(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.live.publish(id, a);
  }

  @Post(':id/start')
  @HttpCode(200)
  @RequirePermissions('live:manage')
  start(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.live.start(id, a);
  }

  @Post(':id/end')
  @HttpCode(200)
  @RequirePermissions('live:manage')
  end(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.live.end(id, a);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('live:manage')
  cancel(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.live.cancel(id, a);
  }

  @Put(':id/recording')
  @RequirePermissions('live:manage')
  @ApiZodBody(LiveRecordingInput)
  recording(
    @Param('id', uuid()) id: string,
    @ZodBody(LiveRecordingInput) body: LiveRecordingInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.live.setRecording(id, body, a);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('live:manage')
  async remove(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.live.remove(id, a);
  }

  @Get(':id/attendance')
  @RequirePermissions('live:manage')
  attendance(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.live.attendance(id, a);
  }

  @Get(':id/attendance.csv')
  @RequirePermissions('live:manage')
  @RateLimit({ name: 'exports', limit: 60, windowSeconds: 3600, by: ['user'] })
  async attendanceCsv(
    @Param('id', uuid()) id: string,
    @StaffActor() a: ContentActor,
    @Res() reply: FastifyReply,
  ) {
    const body = await this.live.attendanceCsv(id, a);
    void reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Cache-Control', 'private, no-store')
      .header('Content-Disposition', `attachment; filename="live-attendance-${id}.csv"`)
      .send(body);
  }
}
