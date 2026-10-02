import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AdminListQuery,
  CourseInput,
  CourseLinksInput,
  CoursePricingInput,
  CourseSubjectsInput,
  GrantCourseAccessInput,
  InstructorProfileInput,
  RevokeEntitlementInput,
  StatusChangeInput,
  type LocalizedText,
} from '@tk/contracts';
import { z } from 'zod';
import { Audiences, RequireAnyPermission, RequirePermissions } from '../../common/auth/auth-context.js';
import { Errors } from '../../common/errors/app-error.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MediaService } from '../media/media.service.js';
import { CoursesService } from './courses.service.js';
import { EntitlementsService } from './entitlements.service.js';
import { StaffActor } from './request-helpers.js';
import type { ContentActor } from './scope.service.js';

const uuid = () => new ParseUUIDPipe();
const ScopesInput = z.object({
  scopes: z.array(z.object({ scopeType: z.enum(['course', 'subject']), scopeId: z.uuid() })).max(200),
});

@ApiTags('admin-courses')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin')
export class AdminCoursesController {
  constructor(
    private readonly courses: CoursesService,
    private readonly entitlements: EntitlementsService,
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── Courses ─────────────

  @Get('courses')
  @RequireAnyPermission('courses:edit', 'courses:publish', 'courses:pricing', 'entitlements:grant')
  list(@ZodQuery(AdminListQuery) query: AdminListQuery, @StaffActor() a: ContentActor) {
    return this.courses.list(query, a);
  }

  @Post('courses')
  @RequirePermissions('courses:edit')
  @ApiZodBody(CourseInput)
  create(@ZodBody(CourseInput) body: CourseInput, @StaffActor() a: ContentActor) {
    return this.courses.create(body, a);
  }

  @Get('courses/:id')
  @RequireAnyPermission('courses:edit', 'courses:publish', 'courses:pricing')
  get(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    return this.courses.get(id, a);
  }

  @Put('courses/:id')
  @HttpCode(204)
  @RequirePermissions('courses:edit')
  @ApiZodBody(CourseInput)
  async update(
    @Param('id', uuid()) id: string,
    @ZodBody(CourseInput) body: CourseInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.courses.update(id, body, a);
  }

  @Put('courses/:id/pricing')
  @HttpCode(204)
  @RequirePermissions('courses:pricing')
  @ApiZodBody(CoursePricingInput)
  async pricing(
    @Param('id', uuid()) id: string,
    @ZodBody(CoursePricingInput) body: CoursePricingInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.courses.updatePricing(id, body, a);
  }

  @Put('courses/:id/subjects')
  @HttpCode(204)
  @RequirePermissions('courses:edit')
  @ApiZodBody(CourseSubjectsInput)
  async subjects(
    @Param('id', uuid()) id: string,
    @ZodBody(CourseSubjectsInput) body: CourseSubjectsInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.courses.setSubjects(id, body, a);
  }

  @Put('courses/:id/links')
  @HttpCode(204)
  @RequirePermissions('courses:edit')
  @ApiZodBody(CourseLinksInput)
  async links(
    @Param('id', uuid()) id: string,
    @ZodBody(CourseLinksInput) body: CourseLinksInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.courses.setLinks(id, body, a);
  }

  @Put('courses/:id/publishing')
  @HttpCode(204)
  @RequirePermissions('courses:edit')
  @ApiZodBody(StatusChangeInput)
  async status(
    @Param('id', uuid()) id: string,
    @ZodBody(StatusChangeInput) body: StatusChangeInput,
    @StaffActor() a: ContentActor,
  ) {
    await this.courses.setStatus(id, body, a);
  }

  @Delete('courses/:id')
  @HttpCode(204)
  @RequirePermissions('courses:edit')
  async remove(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.courses.remove(id, a);
  }

  @Post('courses/:id/restore')
  @HttpCode(204)
  @RequirePermissions('courses:edit')
  async restore(@Param('id', uuid()) id: string, @StaffActor() a: ContentActor) {
    await this.courses.restore(id, a);
  }

  // ───────────── Instructor profiles (D-013) ─────────────

  @Get('instructors')
  @RequireAnyPermission('instructors:manage', 'courses:edit')
  async instructors() {
    const staff = await this.prisma.user.findMany({
      where: { kind: 'staff', status: 'active' },
      include: { instructorProfile: { include: { photo: true } } },
      orderBy: { fullName: 'asc' },
    });
    return staff.map((u) => ({
      userId: u.id,
      fullName: u.fullName,
      email: u.email,
      profile: u.instructorProfile
        ? {
            displayName: u.instructorProfile.displayName as LocalizedText,
            bio: (u.instructorProfile.bio as LocalizedText | null) ?? null,
            photoMediaId: u.instructorProfile.photoMediaId,
            photoUrl: u.instructorProfile.photo
              ? this.storage.publicUrl(u.instructorProfile.photo.objectKey)
              : null,
            isPublic: u.instructorProfile.isPublic,
          }
        : null,
    }));
  }

  @Put('instructors/:userId')
  @HttpCode(204)
  @RequirePermissions('instructors:manage')
  @ApiZodBody(InstructorProfileInput)
  async saveInstructor(
    @Param('userId', uuid()) userId: string,
    @ZodBody(InstructorProfileInput) body: InstructorProfileInput,
    @StaffActor() a: ContentActor,
  ) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, kind: 'staff' } });
    if (!user) throw Errors.notFound('Staff member');
    await this.media.assertPublicImages([body.photoMediaId]);
    const data = {
      displayName: body.displayName,
      bio: (body.bio ?? Prisma.DbNull) as Prisma.InputJsonValue,
      photoMediaId: body.photoMediaId ?? null,
      isPublic: body.isPublic,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.instructorProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
      await this.audit.record(
        {
          actorUserId: a.userId,
          action: 'instructor.profile',
          entityType: 'user',
          entityId: userId,
          changes: { after: body },
          client: a.client,
        },
        tx,
      );
    });
  }

  // ───────────── Staff scopes (instructors limited to courses/subjects) ─────────────

  @Get('staff/:id/scopes')
  @RequirePermissions('staff:read')
  async scopes(@Param('id', uuid()) userId: string) {
    return this.prisma.staffScope.findMany({ where: { userId }, select: { scopeType: true, scopeId: true } });
  }

  @Put('staff/:id/scopes')
  @HttpCode(204)
  @RequirePermissions('staff:manage')
  @ApiZodBody(ScopesInput)
  async setScopes(
    @Param('id', uuid()) userId: string,
    @ZodBody(ScopesInput) body: z.infer<typeof ScopesInput>,
    @StaffActor() a: ContentActor,
  ) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, kind: 'staff' } });
    if (!user) throw Errors.notFound('Staff member');
    const courseIds = body.scopes.filter((s) => s.scopeType === 'course').map((s) => s.scopeId);
    const subjectIds = body.scopes.filter((s) => s.scopeType === 'subject').map((s) => s.scopeId);
    if (
      (courseIds.length &&
        (await this.prisma.course.count({ where: { id: { in: courseIds }, deletedAt: null } })) !==
          new Set(courseIds).size) ||
      (subjectIds.length &&
        (await this.prisma.subject.count({ where: { id: { in: subjectIds }, deletedAt: null } })) !==
          new Set(subjectIds).size)
    ) {
      throw Errors.validation([
        { path: 'scopes', message: 'One or more courses or subjects were not found' },
      ]);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.staffScope.deleteMany({ where: { userId } });
      if (body.scopes.length)
        await tx.staffScope.createMany({
          data: body.scopes.map((s) => ({ userId, ...s })),
          skipDuplicates: true,
        });
      await this.audit.record(
        {
          actorUserId: a.userId,
          action: 'staff.scopes',
          entityType: 'user',
          entityId: userId,
          changes: { after: body.scopes },
          client: a.client,
        },
        tx,
      );
    });
  }

  // ───────────── Student course access (admin grants) ─────────────

  @Get('users/:id/entitlements')
  @RequireAnyPermission('users:read', 'entitlements:grant')
  userEntitlements(@Param('id', uuid()) userId: string) {
    return this.entitlements.listForUser(userId);
  }

  @Post('users/:id/entitlements')
  @RequirePermissions('entitlements:grant')
  @ApiZodBody(GrantCourseAccessInput)
  grant(
    @Param('id', uuid()) userId: string,
    @ZodBody(GrantCourseAccessInput) body: GrantCourseAccessInput,
    @StaffActor() a: ContentActor,
  ) {
    return this.entitlements.grantCourse(userId, body, a.userId, a.client);
  }

  @Post('entitlements/:id/revoke')
  @HttpCode(204)
  @RequirePermissions('entitlements:grant')
  @ApiZodBody(RevokeEntitlementInput)
  async revoke(
    @Param('id', uuid()) id: string,
    @ZodBody(RevokeEntitlementInput) body: z.infer<typeof RevokeEntitlementInput>,
    @StaffActor() a: ContentActor,
  ) {
    await this.entitlements.revoke(id, body.reason, a.userId, a.client);
  }
}
