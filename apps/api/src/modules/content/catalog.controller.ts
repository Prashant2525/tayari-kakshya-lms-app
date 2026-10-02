import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CursorQuery, ExamNodeType, type Platform } from '@tk/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  Audiences,
  CurrentAuth,
  OptionalAuth,
  Public,
  type AuthContext,
} from '../../common/auth/auth-context.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ZodQuery } from '../../common/validation/zod.js';
import { CatalogService } from './catalog.service.js';
import { ClientPlatform } from './request-helpers.js';
import { TaxonomyService } from './taxonomy.service.js';

const NodesQuery = z.object({ parentId: z.uuid().optional(), type: ExamNodeType.optional() });
const CoursesQuery = CursorQuery.extend({
  cursor: z.uuid().optional(),
  examNodeId: z.uuid().optional(),
  q: z.string().trim().max(120).optional(),
  featured: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
const uuid = () => new ParseUUIDPipe();

/** Public catalog (browsable before sign-in). */
@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly taxonomy: TaxonomyService,
  ) {}

  @Public()
  @Get('exam-nodes')
  nodes(@ZodQuery(NodesQuery) query: z.infer<typeof NodesQuery>) {
    return this.taxonomy.publicNodes(query.parentId ?? null, query.type);
  }

  @Public()
  @Get('courses')
  courses(@ZodQuery(CoursesQuery) query: z.infer<typeof CoursesQuery>, @ClientPlatform() platform: Platform) {
    return this.catalog.listCourses({ ...query, platform });
  }

  @OptionalAuth()
  @Get('courses/:slug')
  course(@Param('slug') slug: string, @ClientPlatform() platform: Platform, @Req() req: FastifyRequest) {
    const viewer = req.auth?.audience === 'student' ? { userId: req.auth.userId } : null;
    return this.catalog.courseDetail(slug, platform, viewer);
  }
}

/** Signed-in student learning endpoints. Premium checks happen on the server for every request. */
@ApiTags('learning')
@ApiBearerAuth()
@Audiences('student')
@Controller()
export class LearningController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('me/courses')
  myCourses(@CurrentAuth() auth: AuthContext) {
    return this.catalog.myCourses({ userId: auth.userId });
  }

  @Get('courses/:courseId/subjects/:subjectId/outline')
  outline(
    @Param('courseId', uuid()) courseId: string,
    @Param('subjectId', uuid()) subjectId: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.catalog.subjectOutline(courseId, subjectId, { userId: auth.userId });
  }

  @Get('learning-items/:id')
  @Header('Cache-Control', 'private, no-store')
  item(@Param('id', uuid()) id: string, @CurrentAuth() auth: AuthContext) {
    return this.catalog.itemContent(id, { userId: auth.userId });
  }

  /** Watermarked PDF stream (D-014). `?download=true` only for items marked downloadable. */
  @Get('learning-items/:id/pdf')
  @RateLimit({ name: 'learning.pdf', limit: 60, windowSeconds: 3600, by: ['user'] })
  async pdf(
    @Param('id', uuid()) id: string,
    @Query('download') download: string | undefined,
    @CurrentAuth() auth: AuthContext,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.catalog.itemPdf(id, { userId: auth.userId }, download === 'true');
    void reply
      .header('Content-Type', 'application/pdf')
      .header('Cache-Control', 'private, no-store')
      .header('Content-Disposition', `${file.disposition}; filename="${file.filename}"`)
      .send(file.body);
  }

  @Get('learning-items/:id/playback')
  @Header('Cache-Control', 'private, no-store')
  @RateLimit({ name: 'learning.playback', limit: 300, windowSeconds: 3600, by: ['user'] })
  playback(@Param('id', uuid()) id: string, @CurrentAuth() auth: AuthContext) {
    return this.catalog.itemPlayback(id, { userId: auth.userId });
  }
}
