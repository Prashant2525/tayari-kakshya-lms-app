import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  richDocMediaIds,
  type AdminListQuery,
  type CourseInput,
  type CourseLinksInput,
  type CoursePricingInput,
  type CourseSubjectsInput,
  type LocalizedRichDoc,
  type LocalizedText,
  type StatusChangeInput,
} from '@tk/contracts';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MediaService } from '../media/media.service.js';
import { activeEntitlementWhere } from './entitlements.service.js';
import { assertCanSetStatus, assertSchedule } from './publishing.js';
import { assertCanEditLive, ScopeService, type ContentActor } from './scope.service.js';

const json = (v: unknown) => (v ?? Prisma.DbNull) as Prisma.InputJsonValue;
const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

/** Course administration: details, pricing (separate permission), subjects, links, publishing (D-023). */
@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly media: MediaService,
    private readonly storage: StorageService,
  ) {}

  async list(query: AdminListQuery, actor: ContentActor) {
    const allowed = await this.scope.allowedCourseIds(actor);
    const where: Prisma.CourseWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.status ? { status: query.status } : {}),
      ...(allowed ? { id: { in: [...allowed] } } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { path: ['en'], string_contains: query.q, mode: 'insensitive' } },
              { title: { path: ['ne'], string_contains: query.q } },
              { slug: { contains: query.q.toLowerCase() } },
            ],
          }
        : {}),
      ...(query.cursor ? { id: { lt: query.cursor } } : {}),
    };
    const rows = await this.prisma.course.findMany({
      where,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      include: { thumbnail: true, _count: { select: { subjects: true } } },
    });
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((c) => ({
        id: c.id,
        slug: c.slug,
        title: c.title as LocalizedText,
        thumbnailUrl: c.thumbnail ? this.storage.publicUrl(c.thumbnail.objectKey) : null,
        status: c.status,
        publishAt: c.publishAt?.toISOString() ?? null,
        pricePaisa: c.pricePaisa,
        salePricePaisa: c.salePricePaisa,
        isFeatured: c.isFeatured,
        subjectCount: c._count.subjects,
        deletedAt: c.deletedAt?.toISOString() ?? null,
        updatedAt: c.updatedAt.toISOString(),
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async get(id: string, actor: ContentActor) {
    await this.scope.assertCourse(actor, id);
    const c = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
      include: {
        thumbnail: true,
        subjects: {
          orderBy: { sortOrder: 'asc' },
          include: {
            subject: { select: { id: true, name: true, status: true } },
            paper: { select: { id: true, name: true } },
          },
        },
        examNodes: { include: { examNode: { select: { id: true, name: true, nodeType: true } } } },
        instructors: {
          orderBy: { sortOrder: 'asc' },
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!c) throw Errors.notFound('Course');
    const activeStudents = await this.prisma.entitlement.count({
      where: { courseId: id, ...activeEntitlementWhere() },
    });
    return {
      id: c.id,
      slug: c.slug,
      title: c.title as LocalizedText,
      shortDescription: (c.shortDescription as LocalizedText | null) ?? null,
      description: (c.description as LocalizedRichDoc | null) ?? null,
      thumbnailMediaId: c.thumbnailMediaId,
      thumbnailUrl: c.thumbnail ? this.storage.publicUrl(c.thumbnail.objectKey) : null,
      language: c.language,
      isFeatured: c.isFeatured,
      popularityRank: c.popularityRank,
      status: c.status,
      publishAt: c.publishAt?.toISOString() ?? null,
      pricing: {
        pricePaisa: c.pricePaisa,
        salePricePaisa: c.salePricePaisa,
        saleStartsAt: c.saleStartsAt?.toISOString() ?? null,
        saleEndsAt: c.saleEndsAt?.toISOString() ?? null,
        validityType: c.validityType,
        validityDays: c.validityDays,
        validityEndsOn: c.validityEndsOn?.toISOString().slice(0, 10) ?? null,
      },
      subjects: c.subjects.map((s) => ({
        subjectId: s.subjectId,
        name: s.subject.name as LocalizedText,
        subjectStatus: s.subject.status,
        paperId: s.paperId,
        paperName: (s.paper?.name as LocalizedText | undefined) ?? null,
        displayFullMarks: num(s.displayFullMarks),
        displayPassMarks: num(s.displayPassMarks),
        displayDurationMinutes: s.displayDurationMinutes,
      })),
      examNodes: c.examNodes.map((e) => ({
        id: e.examNode.id,
        name: e.examNode.name as LocalizedText,
        nodeType: e.examNode.nodeType,
      })),
      instructors: c.instructors.map((i) => ({ id: i.user.id, fullName: i.user.fullName })),
      activeStudents,
      certificateTemplateId: c.certificateTemplateId,
    };
  }

  async create(input: CourseInput, actor: ContentActor) {
    await this.scope.assertUnscoped(actor);
    await this.assertMedia(input);
    const course = await this.uniqueSlug(() =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.course.create({
          data: { ...this.detailData(input), createdById: actor.userId, updatedById: actor.userId },
        });
        await this.log(tx, actor, 'course.create', created.id, {
          after: { slug: input.slug, title: input.title },
        });
        return created;
      }),
    );
    return { id: course.id };
  }

  async update(id: string, input: CourseInput, actor: ContentActor) {
    await this.scope.assertCourse(actor, id);
    const before = await this.find(id);
    assertCanEditLive(actor, before.status, 'courses:publish');
    await this.assertMedia(input);
    await this.uniqueSlug(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.course.update({
          where: { id },
          data: { ...this.detailData(input), updatedById: actor.userId },
        });
        await this.log(tx, actor, 'course.update', id, {
          before: { slug: before.slug, title: before.title },
          after: { slug: input.slug, title: input.title },
        });
      }),
    );
  }

  /** Price and validity changes are separately permissioned and always audited with before/after values. */
  async updatePricing(id: string, input: CoursePricingInput, actor: ContentActor) {
    await this.scope.assertCourse(actor, id);
    const before = await this.find(id);
    const data = {
      pricePaisa: input.pricePaisa,
      salePricePaisa: input.salePricePaisa,
      saleStartsAt: input.saleStartsAt ? new Date(input.saleStartsAt) : null,
      saleEndsAt: input.saleEndsAt ? new Date(input.saleEndsAt) : null,
      validityType: input.validityType,
      validityDays: input.validityType === 'days' ? input.validityDays : null,
      validityEndsOn:
        input.validityType === 'fixed_date' && input.validityEndsOn
          ? new Date(`${input.validityEndsOn}T00:00:00Z`)
          : null,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.course.update({ where: { id }, data: { ...data, updatedById: actor.userId } });
      await this.log(tx, actor, 'course.pricing', id, {
        before: {
          pricePaisa: before.pricePaisa,
          salePricePaisa: before.salePricePaisa,
          saleStartsAt: before.saleStartsAt?.toISOString() ?? null,
          saleEndsAt: before.saleEndsAt?.toISOString() ?? null,
          validityType: before.validityType,
          validityDays: before.validityDays,
          validityEndsOn: before.validityEndsOn?.toISOString().slice(0, 10) ?? null,
        },
        after: input,
      });
    });
  }

  async setSubjects(id: string, input: CourseSubjectsInput, actor: ContentActor) {
    await this.scope.assertCourse(actor, id);
    const course = await this.find(id);
    assertCanEditLive(actor, course.status, 'courses:publish');
    const subjectIds = input.subjects.map((s) => s.subjectId);
    if (new Set(subjectIds).size !== subjectIds.length)
      throw Errors.validation([{ path: 'subjects', message: 'A subject can be added only once' }]);
    const found = await this.prisma.subject.count({ where: { id: { in: subjectIds }, deletedAt: null } });
    if (found !== subjectIds.length)
      throw Errors.validation([{ path: 'subjects', message: 'One or more subjects were not found' }]);
    const paperIds = [
      ...new Set(input.subjects.map((s) => s.paperId).filter((v): v is string => Boolean(v))),
    ];
    if (
      paperIds.length &&
      (await this.prisma.paper.count({ where: { id: { in: paperIds }, deletedAt: null } })) !==
        paperIds.length
    ) {
      throw Errors.validation([{ path: 'subjects', message: 'One or more papers were not found' }]);
    }
    for (const s of input.subjects) {
      if (
        s.displayFullMarks != null &&
        s.displayPassMarks != null &&
        s.displayPassMarks > s.displayFullMarks
      ) {
        throw Errors.validation([{ path: 'subjects', message: 'Pass marks cannot exceed full marks' }]);
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.courseSubject.deleteMany({ where: { courseId: id } });
      await tx.courseSubject.createMany({
        data: input.subjects.map((s, i) => ({
          courseId: id,
          subjectId: s.subjectId,
          paperId: s.paperId ?? null,
          sortOrder: i,
          displayFullMarks: s.displayFullMarks ?? null,
          displayPassMarks: s.displayPassMarks ?? null,
          displayDurationMinutes: s.displayDurationMinutes ?? null,
        })),
      });
      await this.log(tx, actor, 'course.subjects', id, { subjects: subjectIds });
    });
  }

  async setLinks(id: string, input: CourseLinksInput, actor: ContentActor) {
    await this.scope.assertCourse(actor, id);
    const course = await this.find(id);
    assertCanEditLive(actor, course.status, 'courses:publish');
    const nodes = [...new Set(input.examNodeIds)];
    const instructors = [...new Set(input.instructorIds)];
    if (
      nodes.length &&
      (await this.prisma.examNode.count({ where: { id: { in: nodes }, deletedAt: null } })) !== nodes.length
    ) {
      throw Errors.validation([{ path: 'examNodeIds', message: 'One or more categories were not found' }]);
    }
    if (
      instructors.length &&
      (await this.prisma.user.count({
        where: { id: { in: instructors }, kind: 'staff', status: 'active' },
      })) !== instructors.length
    ) {
      throw Errors.validation([
        { path: 'instructorIds', message: 'Instructors must be active staff members' },
      ]);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.courseExamNode.deleteMany({ where: { courseId: id } });
      await tx.courseInstructor.deleteMany({ where: { courseId: id } });
      if (nodes.length)
        await tx.courseExamNode.createMany({
          data: nodes.map((examNodeId) => ({ courseId: id, examNodeId })),
        });
      if (instructors.length) {
        await tx.courseInstructor.createMany({
          data: instructors.map((userId, i) => ({ courseId: id, userId, sortOrder: i })),
        });
      }
      await this.log(tx, actor, 'course.links', id, { examNodeIds: nodes, instructorIds: instructors });
    });
  }

  async setStatus(id: string, change: StatusChangeInput, actor: ContentActor) {
    assertCanSetStatus(actor.access, change.status, 'courses:publish');
    await this.scope.assertCourse(actor, id);
    const course = await this.find(id);
    const publishAt = change.status === 'scheduled' && change.publishAt ? new Date(change.publishAt) : null;
    assertSchedule(change.status, publishAt);
    await this.prisma.$transaction(async (tx) => {
      await tx.course.update({
        where: { id },
        data: {
          status: change.status,
          publishAt: change.status === 'published' ? new Date() : publishAt,
          updatedById: actor.userId,
        },
      });
      await this.log(tx, actor, 'course.status', id, {
        before: course.status,
        after: change.status,
        publishAt: publishAt?.toISOString() ?? null,
      });
    });
  }

  /** Courses that students can access cannot be deleted (archive them instead, which keeps their access). */
  async remove(id: string, actor: ContentActor) {
    assertCanSetStatus(actor.access, 'archived', 'courses:publish');
    await this.scope.assertCourse(actor, id);
    await this.find(id);
    const active = await this.prisma.entitlement.count({
      where: { courseId: id, ...activeEntitlementWhere() },
    });
    if (active > 0) {
      throw new AppError(
        409,
        ErrorCode.CONFLICT,
        'Students have access to this course. Archive it instead of deleting.',
        {
          activeStudents: active,
        },
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.course.update({ where: { id }, data: { deletedAt: new Date(), updatedById: actor.userId } });
      await this.log(tx, actor, 'course.delete', id);
    });
  }

  async restore(id: string, actor: ContentActor) {
    assertCanSetStatus(actor.access, 'archived', 'courses:publish');
    await this.scope.assertCourse(actor, id);
    const course = await this.prisma.course.findFirst({ where: { id, deletedAt: { not: null } } });
    if (!course) throw Errors.notFound('Deleted course');
    await this.uniqueSlug(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.course.update({
          where: { id },
          data: { deletedAt: null, status: 'draft', publishAt: null },
        });
        await this.log(tx, actor, 'course.restore', id);
      }),
    );
  }

  // ───────────── helpers ─────────────

  private detailData(input: CourseInput) {
    return {
      slug: input.slug,
      title: input.title,
      shortDescription: json(input.shortDescription),
      description: json(input.description),
      thumbnailMediaId: input.thumbnailMediaId ?? null,
      language: input.language,
      isFeatured: input.isFeatured,
      popularityRank: input.popularityRank ?? null,
    };
  }

  private async assertMedia(input: CourseInput): Promise<void> {
    const inDescription = input.description
      ? [...richDocMediaIds(input.description.en), ...richDocMediaIds(input.description.ne)]
      : [];
    await this.media.assertPublicImages([input.thumbnailMediaId, ...inDescription]);
  }

  private async find(id: string) {
    const course = await this.prisma.course.findFirst({ where: { id, deletedAt: null } });
    if (!course) throw Errors.notFound('Course');
    return course;
  }

  private async uniqueSlug<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(409, ErrorCode.CONFLICT, 'This URL name (slug) is already used', {
          field: 'slug',
        });
      }
      throw err;
    }
  }

  private log(tx: Tx, actor: ContentActor, action: string, entityId: string, changes?: unknown) {
    return this.audit.record(
      {
        actorUserId: actor.userId,
        action,
        entityType: 'course',
        entityId,
        changes: changes as Prisma.InputJsonValue,
        client: actor.client,
      },
      tx,
    );
  }
}
