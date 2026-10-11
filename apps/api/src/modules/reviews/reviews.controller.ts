import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminReviewQuery, CursorQuery, RejectReviewInput, ReviewInput } from '@tk/contracts';
import {
  Audiences,
  CurrentAuth,
  Public,
  RequirePermissions,
  type AuthContext,
} from '../../common/auth/auth-context.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { ReviewsService } from './reviews.service.js';

const uuid = () => new ParseUUIDPipe();

/** Approved reviews of a course, for everyone (app and website). */
@ApiTags('reviews')
@Public()
@Controller('courses')
export class PublicReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get(':slug/reviews')
  list(@Param('slug') slug: string, @ZodQuery(CursorQuery) query: CursorQuery) {
    return this.reviews.publicList(slug, query);
  }
}

/** The student's own review of a course they have (S4, D-066). */
@ApiTags('reviews')
@ApiBearerAuth()
@Audiences('student')
@Controller('me/courses/:courseId/review')
export class MyReviewController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  mine(@Param('courseId', uuid()) courseId: string, @CurrentAuth() auth: AuthContext) {
    return this.reviews.mine(auth.userId, courseId);
  }

  @Put()
  @RateLimit({ name: 'reviews.save', limit: 20, windowSeconds: 3600, by: ['user'] })
  @ApiZodBody(ReviewInput)
  save(
    @Param('courseId', uuid()) courseId: string,
    @ZodBody(ReviewInput) body: ReviewInput,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.reviews.save(auth.userId, courseId, body);
  }

  @Delete()
  @HttpCode(204)
  async remove(@Param('courseId', uuid()) courseId: string, @CurrentAuth() auth: AuthContext) {
    await this.reviews.remove(auth.userId, courseId);
  }
}

@ApiTags('admin-reviews')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @RequirePermissions('reviews:moderate')
  list(@ZodQuery(AdminReviewQuery) query: AdminReviewQuery) {
    return this.reviews.adminList(query);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('reviews:moderate')
  approve(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.reviews.approve(id, a);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions('reviews:moderate')
  @ApiZodBody(RejectReviewInput)
  reject(
    @Param('id', uuid()) id: string,
    @ZodBody(RejectReviewInput) body: RejectReviewInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.reviews.reject(id, body.reason, a);
  }
}
