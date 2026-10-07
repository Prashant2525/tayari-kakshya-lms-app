import { Injectable } from '@nestjs/common';
import { ErrorCode, type CourseUpdateInput, type LocalizedText } from '@tk/contracts';
import { Errors } from '../../common/errors/app-error.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { EntitlementsService } from '../content/entitlements.service.js';
import { ScopeService, type ContentActor } from '../content/scope.service.js';
import { courseUpdateMessage } from './messages.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Course updates (D-060): staff send them by hand to everyone with access to the course now (bought, granted, joined
 * free or through a plan); each student's "Course updates" choices decide push and email. Every send is kept.
 */
@Injectable()
export class CourseUpdatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly notifications: NotificationsService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(courseId: string, actor: ContentActor) {
    await this.course(courseId, actor);
    const [rows, students] = await Promise.all([
      this.prisma.courseUpdate.findMany({
        where: { courseId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { sentBy: { select: { fullName: true } } },
      }),
      this.entitlements.studentIdsWithCourses([courseId]),
    ]);
    return {
      students: students.length,
      data: rows.map((r) => ({
        id: r.id,
        title: r.title as LocalizedText,
        message: r.message as LocalizedText,
        recipients: r.recipients,
        sentBy: r.sentBy.fullName,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async send(courseId: string, input: CourseUpdateInput, actor: ContentActor) {
    const course = await this.course(courseId, actor);
    const recipients = await this.entitlements.studentIdsWithCourses([course.id]);
    if (!recipients.length) {
      throw Errors.conflict(ErrorCode.CONFLICT, 'No students have access to this course yet');
    }
    const update = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.courseUpdate.create({
          data: {
            courseId: course.id,
            title: input.title as Prisma.InputJsonValue,
            message: input.message as Prisma.InputJsonValue,
            recipients: recipients.length,
            sentById: actor.userId,
          },
        });
        await this.notifications.notify(
          recipients,
          courseUpdateMessage({ id: created.id, title: input.title, message: input.message }, course),
          tx,
        );
        await this.audit.record(
          {
            actorUserId: actor.userId,
            action: 'course.update_sent',
            entityType: 'course',
            entityId: course.id,
            changes: { updateId: created.id, title: input.title, recipients: recipients.length },
            client: actor.client,
          },
          tx,
        );
        return created;
      },
      { timeout: 120_000 },
    );
    return { id: update.id, recipients: update.recipients, createdAt: update.createdAt.toISOString() };
  }

  private async course(courseId: string, actor: ContentActor) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, slug: true },
    });
    if (!course) throw Errors.notFound('Course');
    await this.scope.assertCourse(actor, course.id);
    return course;
  }
}
