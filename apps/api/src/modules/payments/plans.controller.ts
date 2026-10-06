import { Controller, Get, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlanCoursesInput, PlanInput, PlanPricingInput, PlanStatusInput, type Platform } from '@tk/contracts';
import type { FastifyRequest } from 'fastify';
import { Audiences, OptionalAuth, RequirePermissions } from '../../common/auth/auth-context.js';
import { ApiZodBody, ZodBody } from '../../common/validation/zod.js';
import { ClientPlatform, StaffActor } from '../content/request-helpers.js';
import type { ContentActor } from '../content/scope.service.js';
import { PlansService } from './plans.service.js';

const uuid = () => new ParseUUIDPipe();

/** Live plans for students (browsable before sign-in; with their own plan once signed in). */
@ApiTags('plans')
@Controller()
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @OptionalAuth()
  @Get('plans')
  live(@ClientPlatform() platform: Platform, @Req() req: FastifyRequest) {
    return this.plans.live(platform, req.auth?.audience === 'student' ? req.auth.userId : null);
  }
}

/** Plans in the CMS (D-023, D-054). */
@ApiTags('admin-plans')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin/plans')
export class AdminPlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @RequirePermissions('plans:manage')
  list() {
    return this.plans.list();
  }

  @Post()
  @RequirePermissions('plans:manage')
  @ApiZodBody(PlanInput)
  create(@ZodBody(PlanInput) body: PlanInput, @StaffActor() a: ContentActor) {
    return this.plans.create(body, a);
  }

  @Get(':id')
  @RequirePermissions('plans:manage')
  detail(@Param('id', uuid()) id: string) {
    return this.plans.detail(id);
  }

  @Put(':id')
  @RequirePermissions('plans:manage')
  @ApiZodBody(PlanInput)
  async update(
    @Param('id', uuid()) id: string,
    @ZodBody(PlanInput) body: PlanInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.plans.update(id, body, a);
    return this.plans.detail(id);
  }

  @Put(':id/pricing')
  @RequirePermissions('plans:manage')
  @ApiZodBody(PlanPricingInput)
  async pricing(
    @Param('id', uuid()) id: string,
    @ZodBody(PlanPricingInput) body: PlanPricingInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.plans.updatePricing(id, body, a);
    return this.plans.detail(id);
  }

  @Put(':id/courses')
  @RequirePermissions('plans:manage')
  @ApiZodBody(PlanCoursesInput)
  async courses(
    @Param('id', uuid()) id: string,
    @ZodBody(PlanCoursesInput) body: PlanCoursesInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.plans.setCourses(id, body, a);
    return this.plans.detail(id);
  }

  @Put(':id/status')
  @RequirePermissions('plans:manage')
  @ApiZodBody(PlanStatusInput)
  async status(
    @Param('id', uuid()) id: string,
    @ZodBody(PlanStatusInput) body: PlanStatusInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.plans.setStatus(id, body, a);
    return this.plans.detail(id);
  }
}
