import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ErrorCode,
  type CourseInterestContactInput,
  type CourseInterestQuery,
  type LocalizedText,
} from '@tk/contracts';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { ENV, type Env } from '../../config/env.js';
import { MailService } from '../../infra/messaging/mail.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { ContentActor } from '../content/scope.service.js';
import { EntitlementsService } from '../content/entitlements.service.js';
import { isLive } from '../content/publishing.js';
import { SettingsService } from '../settings/settings.service.js';
import { fillTemplate } from './account-emails.service.js';
import { BuyingGuideService } from './buying-guide.service.js';

/** A course page opened again within this time is the same visit. */
const VISIT_MS = 30 * 60_000;

const pick = (text: LocalizedText, locale: 'en' | 'ne') => text[locale] ?? text.en ?? text.ne ?? '';

/**
 * Interest from Apple devices (D-061). The iPhone app cannot sell or point to the website (D-027, App Review 3.1.1),
 * so it has no button for this: opening a paid course without access on an iOS session is recorded quietly, and
 * staff can email the student the course's website link — communication outside the app, which Apple allows (3.1.3).
 */
@Injectable()
export class CourseInterestsService {
  private readonly logger = new Logger(CourseInterestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
    private readonly guide: BuyingGuideService,
    @Inject(ENV) private readonly env: Pick<Env, 'PUBLIC_WEB_URL'>,
  ) {}

  /** The course page was opened on this session; recorded only for Apple devices. Never fails the page. */
  async record(userId: string, sessionId: string, courseId: string, now = new Date()): Promise<void> {
    try {
      const session = await this.prisma.authSession.findUnique({
        where: { id: sessionId },
        select: { userId: true, platform: true, deviceName: true },
      });
      if (!session || session.userId !== userId || session.platform !== 'ios') return;
      await this.prisma.$executeRaw`
        INSERT INTO course_interests (id, user_id, course_id, device_name, views, first_seen_at, last_seen_at)
        VALUES (gen_random_uuid(), ${userId}::uuid, ${courseId}::uuid, ${session.deviceName}, 1, ${now}, ${now})
        ON CONFLICT (user_id, course_id) DO UPDATE SET
          views = course_interests.views
            + CASE WHEN course_interests.last_seen_at < ${new Date(now.getTime() - VISIT_MS)} THEN 1 ELSE 0 END,
          last_seen_at = GREATEST(course_interests.last_seen_at, ${now}),
          device_name = EXCLUDED.device_name`;
    } catch (err) {
      this.logger.warn({ err: String(err), courseId }, 'Course interest not recorded');
    }
  }

  async list(query: CourseInterestQuery) {
    const rows = await this.prisma.courseInterest.findMany({
      where: {
        user: { status: 'active' },
        ...(query.status === 'open' ? { contactedAt: null } : {}),
        ...(query.status === 'contacted' ? { contactedAt: { not: null } } : {}),
      },
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        user: { select: { fullName: true, email: true } },
        course: { select: { id: true, slug: true, title: true } },
        contactedBy: { select: { fullName: true } },
      },
    });
    const page = rows.slice(0, query.limit);
    const data = [];
    for (const r of page) {
      data.push({
        id: r.id,
        student: { id: r.userId, name: r.user.fullName, email: r.user.email },
        course: { id: r.course.id, slug: r.course.slug, title: r.course.title as LocalizedText },
        deviceName: r.deviceName,
        views: r.views,
        firstSeenAt: r.firstSeenAt.toISOString(),
        lastSeenAt: r.lastSeenAt.toISOString(),
        contactedAt: r.contactedAt?.toISOString() ?? null,
        contactedBy: r.contactedBy?.fullName ?? null,
        // Bought on the website since, or given access by staff.
        hasAccess: (await this.entitlements.activeCourseIds(r.userId)).has(r.courseId),
      });
    }
    return { data, nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null };
  }

  /** The email staff are about to send: the CMS template in the student's language, name and course filled in. */
  async draft(id: string) {
    const { interest, link } = await this.contactable(id);
    const template = await this.settings.get('emails.purchaseLink');
    const locale = interest.user.locale;
    const values = {
      name: interest.user.fullName,
      course: pick(interest.course.title as LocalizedText, locale),
    };
    return {
      to: interest.user.email,
      locale,
      link,
      subject: fillTemplate(template.subject[locale], values),
      body: fillTemplate(template.body[locale], values),
    };
  }

  async contact(id: string, input: CourseInterestContactInput, actor: ContentActor) {
    const { interest, link } = await this.contactable(id);
    const course = pick(interest.course.title as LocalizedText, interest.user.locale);
    const values = { name: interest.user.fullName, course, link };
    try {
      await this.mail.send({
        to: interest.user.email as string,
        subject: fillTemplate(input.subject, values),
        ...(await this.guide.compose(fillTemplate(input.body, values), interest.user.locale)),
      });
    } catch (err) {
      this.logger.warn({ err: String(err), interestId: id }, 'Purchase link email failed');
      throw new AppError(
        503,
        ErrorCode.INTERNAL_ERROR,
        'The email could not be sent. Try again in a moment.',
      );
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.courseInterest.update({
        where: { id },
        data: { contactedAt: now, contactedById: actor.userId },
      });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'course_interest.contacted',
          entityType: 'course_interest',
          entityId: id,
          changes: { userId: interest.userId, courseId: interest.courseId },
          client: actor.client,
        },
        tx,
      );
    });
    return { id, contactedAt: now.toISOString() };
  }

  private async contactable(id: string) {
    const interest = await this.prisma.courseInterest.findUnique({
      where: { id },
      include: {
        user: { select: { fullName: true, email: true, locale: true, status: true } },
        course: true,
      },
    });
    if (!interest || interest.user.status !== 'active' || !interest.user.email) {
      throw Errors.notFound('Interested student');
    }
    if (!isLive(interest.course)) {
      throw Errors.conflict(ErrorCode.CONFLICT, 'This course is not on sale on the website');
    }
    const website = this.env.PUBLIC_WEB_URL?.replace(/\/+$/, '');
    if (!website) {
      throw Errors.conflict(
        ErrorCode.CONFLICT,
        'The website address (PUBLIC_WEB_URL) is not set on the server',
      );
    }
    return { interest, link: `${website}/courses/${interest.course.slug}` };
  }
}
