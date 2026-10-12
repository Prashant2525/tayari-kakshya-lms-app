import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type AdminLiveClassQuery,
  type LiveClassInput,
  type LiveClassQuery,
  type LiveRecordingInput,
  type LocalizedText,
} from '@tk/contracts';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { Prisma, type LiveClass, type VideoAsset } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { csv } from '../analytics/csv.js';
import { AuditService } from '../audit/audit.service.js';
import { EntitlementsService } from '../content/entitlements.service.js';
import { ScopeService, type ContentActor } from '../content/scope.service.js';
import { liveWhere } from '../content/publishing.js';
import { parseYouTubeId, VideoService } from '../content/video.service.js';
import {
  liveCancelledMessage,
  liveNowMessage,
  liveReminderMessage,
  liveScheduledMessage,
} from '../notifications/messages.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SettingsService } from '../settings/settings.service.js';

const MINUTE = 60_000;
const PAGE = 20;
const locked = () =>
  new AppError(403, ErrorCode.CONTENT_LOCKED, 'This live class is for students of the course');
const verificationRequired = () =>
  new AppError(403, ErrorCode.VERIFICATION_REQUIRED, 'Verify your email or phone to join live classes');

type LiveWithRefs = LiveClass & {
  course: { id: string; slug: string; title: unknown };
  instructor: { fullName: string } | null;
  recording: VideoAsset | null;
  _count?: { attendance: number };
};
const include = {
  course: { select: { id: true, slug: true, title: true } },
  instructor: { select: { fullName: true } },
  recording: true,
} as const;

/** When students may join: from `joinOpensMinutes` before the start until the class ends (or once it is live). */
export function joinOpensAt(live: Pick<LiveClass, 'startsAt'>, joinOpensMinutes: number): Date {
  return new Date(live.startsAt.getTime() - joinOpensMinutes * MINUTE);
}
export function joinOpen(
  live: Pick<LiveClass, 'startsAt' | 'status'>,
  joinOpensMinutes: number,
  now: Date,
): boolean {
  if (live.status === 'live') return true;
  if (live.status !== 'scheduled') return false;
  return now >= joinOpensAt(live, joinOpensMinutes);
}

/**
 * Live classes (S22, D-072). Staff schedule a class for a course on YouTube Live or Zoom, publish it (students of the
 * course are told), start and end it (or the worker does, at its start time and after its end), cancel it, and add a
 * recording; attendance is kept from students' joins. Students see a course's published classes; the link is given
 * only to a student who may join, inside the join window (Free: any signed-in student; Premium: premium access to
 * the course, D-053).
 */
@Injectable()
export class LiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly scope: ScopeService,
    private readonly video: VideoService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── Staff ─────────────

  async adminList(query: AdminLiveClassQuery, actor: ContentActor, now = new Date()) {
    // Staff limited to some courses see only those.
    const allowed = await this.scope.allowedCourseIds(actor);
    const courseIds = allowed ? [...allowed].filter((id) => !query.courseId || id === query.courseId) : null;
    const rows = await this.prisma.liveClass.findMany({
      where: {
        deletedAt: null,
        ...(courseIds ? { courseId: { in: courseIds } } : query.courseId ? { courseId: query.courseId } : {}),
        ...(query.when === 'upcoming' ? { status: { in: ['scheduled', 'live'] } } : {}),
        ...(query.when === 'past' ? { status: { in: ['ended', 'cancelled'] } } : {}),
      },
      include: { ...include, _count: { select: { attendance: true } } },
      orderBy: [{ startsAt: query.when === 'past' ? 'desc' : 'asc' }, { id: 'asc' }],
      take: PAGE + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, PAGE);
    return {
      data: page.map((l) => this.adminView(l, now)),
      nextCursor: rows.length > PAGE ? page.at(-1)!.id : null,
    };
  }

  async adminGet(id: string, actor: ContentActor, now = new Date()) {
    return this.adminView(await this.staffClass(id, actor), now);
  }

  async create(input: LiveClassInput, actor: ContentActor) {
    await this.checkInput(input, actor);
    const created = await this.prisma.$transaction(async (tx) => {
      const live = await tx.liveClass.create({ data: { ...this.data(input), createdById: actor.userId } });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'live.created',
          entityType: 'live_class',
          entityId: live.id,
          changes: this.auditable(input),
          client: actor.client,
        },
        tx,
      );
      return live;
    });
    return this.adminGet(created.id, actor);
  }

  async update(id: string, input: LiveClassInput, actor: ContentActor) {
    const before = await this.staffClass(id, actor);
    if (before.status === 'ended' || before.status === 'cancelled') {
      throw Errors.conflict(
        ErrorCode.CONFLICT,
        'An ended or cancelled class cannot be changed (add a recording instead)',
      );
    }
    await this.checkInput(input, actor);
    const startsAt = new Date(input.startsAt);
    const moved = before.publishedAt !== null && startsAt.getTime() !== before.startsAt.getTime();
    await this.prisma.$transaction(async (tx) => {
      const after = await tx.liveClass.update({ where: { id }, data: this.data(input) });
      if (moved && before.status === 'scheduled') {
        await this.notifications.notify(
          await this.recipients(after),
          liveScheduledMessage(this.ref(after), true),
          tx,
        );
      }
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'live.updated',
          entityType: 'live_class',
          entityId: id,
          changes: this.auditable(input),
          client: actor.client,
        },
        tx,
      );
    });
    return this.adminGet(id, actor);
  }

  /** Makes a draft visible to students and tells the course's students when it is. */
  async publish(id: string, actor: ContentActor, now = new Date()) {
    const live = await this.staffClass(id, actor);
    if (live.publishedAt) return this.adminGet(id, actor);
    if (live.status !== 'scheduled')
      throw Errors.conflict(ErrorCode.CONFLICT, 'Only a scheduled class can be published');
    await this.prisma.$transaction(async (tx) => {
      const after = await tx.liveClass.update({ where: { id }, data: { publishedAt: now } });
      if (after.startsAt > now) {
        await this.notifications.notify(
          await this.recipients(after),
          liveScheduledMessage(this.ref(after)),
          tx,
        );
      }
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'live.published',
          entityType: 'live_class',
          entityId: id,
          client: actor.client,
        },
        tx,
      );
    });
    return this.adminGet(id, actor);
  }

  /** The teacher starts the class now (also done automatically at its start time). */
  async start(id: string, actor: ContentActor, now = new Date()) {
    const live = await this.staffClass(id, actor);
    if (!live.publishedAt) throw Errors.conflict(ErrorCode.CONFLICT, 'Publish the class before starting it');
    if (live.status === 'live') return this.adminGet(id, actor);
    if (live.status !== 'scheduled')
      throw Errors.conflict(ErrorCode.CONFLICT, 'This class has ended or was cancelled');
    await this.prisma.$transaction(async (tx) => {
      const after = await tx.liveClass.update({ where: { id }, data: { status: 'live', startedAt: now } });
      await this.notifications.notify(await this.recipients(after), liveNowMessage(this.ref(after)), tx);
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'live.started',
          entityType: 'live_class',
          entityId: id,
          client: actor.client,
        },
        tx,
      );
    });
    return this.adminGet(id, actor);
  }

  async end(id: string, actor: ContentActor, now = new Date()) {
    const live = await this.staffClass(id, actor);
    if (live.status === 'ended') return this.adminGet(id, actor);
    if (live.status === 'cancelled') throw Errors.conflict(ErrorCode.CONFLICT, 'This class was cancelled');
    await this.prisma.$transaction(async (tx) => {
      await tx.liveClass.update({ where: { id }, data: { status: 'ended', endedAt: now } });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'live.ended',
          entityType: 'live_class',
          entityId: id,
          client: actor.client,
        },
        tx,
      );
    });
    return this.adminGet(id, actor);
  }

  async cancel(id: string, actor: ContentActor, now = new Date()) {
    const live = await this.staffClass(id, actor);
    if (live.status === 'cancelled') return this.adminGet(id, actor);
    if (live.status === 'ended') throw Errors.conflict(ErrorCode.CONFLICT, 'This class has already ended');
    await this.prisma.$transaction(async (tx) => {
      const after = await tx.liveClass.update({
        where: { id },
        data: { status: 'cancelled', cancelledAt: now },
      });
      if (after.publishedAt) {
        await this.notifications.notify(
          await this.recipients(after),
          liveCancelledMessage(this.ref(after)),
          tx,
        );
      }
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'live.cancelled',
          entityType: 'live_class',
          entityId: id,
          client: actor.client,
        },
        tx,
      );
    });
    return this.adminGet(id, actor);
  }

  /** Adds, replaces or removes the recording (YouTube or Bunny), watched from the class afterwards. */
  async setRecording(id: string, input: LiveRecordingInput, actor: ContentActor) {
    await this.staffClass(id, actor);
    const asset = input.recording ? await this.video.resolve(input.recording, actor.userId) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.liveClass.update({ where: { id }, data: { recordingVideoId: asset?.id ?? null } });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: asset ? 'live.recording_set' : 'live.recording_removed',
          entityType: 'live_class',
          entityId: id,
          changes: input,
          client: actor.client,
        },
        tx,
      );
    });
    return this.adminGet(id, actor);
  }

  /** Soft delete: a class that is live has to be ended first. */
  async remove(id: string, actor: ContentActor, now = new Date()) {
    const live = await this.staffClass(id, actor);
    if (live.status === 'live') throw Errors.conflict(ErrorCode.CONFLICT, 'End the class before deleting it');
    await this.prisma.$transaction(async (tx) => {
      await tx.liveClass.update({ where: { id }, data: { deletedAt: now } });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'live.deleted',
          entityType: 'live_class',
          entityId: id,
          client: actor.client,
        },
        tx,
      );
    });
  }

  async attendance(id: string, actor: ContentActor) {
    await this.staffClass(id, actor);
    const rows = await this.prisma.liveAttendance.findMany({
      where: { liveClassId: id },
      include: { user: { select: { fullName: true, email: true, phone: true } } },
      orderBy: { firstJoinedAt: 'asc' },
    });
    return {
      total: rows.length,
      data: rows.map((r) => ({
        userId: r.userId,
        name: r.user.fullName,
        email: r.user.email,
        phone: r.user.phone,
        firstJoinedAt: r.firstJoinedAt.toISOString(),
        lastJoinedAt: r.lastJoinedAt.toISOString(),
        joins: r.joins,
      })),
    };
  }

  /** Attendance as CSV (D-072), audited like other exports. */
  async attendanceCsv(id: string, actor: ContentActor) {
    const { data } = await this.attendance(id, actor);
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'export.download',
      entityType: 'live_class',
      entityId: id,
      changes: { kind: 'live-attendance', rows: data.length },
      client: actor.client,
    });
    return csv(
      ['Name', 'Email', 'Phone', 'First joined', 'Last joined', 'Joins'],
      data.map((r) => [r.name, r.email, r.phone, r.firstJoinedAt, r.lastJoinedAt, r.joins]),
    );
  }

  // ───────────── Students ─────────────

  /** A course's published classes, or (without a course) those of the student's own courses. */
  async list(userId: string, query: LiveClassQuery, now = new Date()) {
    const [rules, accessible, premium] = await Promise.all([
      this.settings.get('live.rules'),
      this.entitlements.activeCourseIds(userId, now),
      this.entitlements.premiumCourseIds(userId, now),
    ]);
    const courseFilter = query.courseId
      ? { courseId: query.courseId }
      : { courseId: { in: [...accessible] } };
    const upcoming = query.when === 'upcoming';
    const rows = await this.prisma.liveClass.findMany({
      where: {
        ...this.studentWhere(now),
        ...courseFilter,
        ...(upcoming
          ? {
              OR: [
                { status: { in: ['scheduled', 'live'] } },
                // A cancellation stays in the list until the class would have started.
                { status: 'cancelled', startsAt: { gt: now } },
              ],
            }
          : { status: 'ended' }),
      },
      include,
      orderBy: [{ startsAt: upcoming ? 'asc' : 'desc' }, { id: 'asc' }],
      take: PAGE + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, PAGE);
    const attended = await this.attendedIds(
      userId,
      page.map((l) => l.id),
    );
    return {
      data: page.map((l) => this.studentView(l, premium, rules.joinOpensMinutes, now, attended)),
      nextCursor: rows.length > PAGE ? page.at(-1)!.id : null,
    };
  }

  async get(userId: string, id: string, now = new Date()) {
    const live = await this.studentClass(id, now);
    const [rules, premium, attended] = await Promise.all([
      this.settings.get('live.rules'),
      this.entitlements.premiumCourseIds(userId, now),
      this.attendedIds(userId, [id]),
    ]);
    return this.studentView(live, premium, rules.joinOpensMinutes, now, attended);
  }

  /**
   * Joining: the only place the link is given (D-072). Checks access, verification and the join window, then records
   * attendance and returns where to go — the YouTube player, or the Zoom meeting and its passcode.
   */
  async join(userId: string, id: string, now = new Date()) {
    const live = await this.studentClass(id, now);
    await this.assertAccess(userId, live, now);
    const rules = await this.settings.get('live.rules');
    if (!joinOpen(live, rules.joinOpensMinutes, now)) {
      const opensAt = joinOpensAt(live, rules.joinOpensMinutes);
      throw Errors.conflict(
        ErrorCode.LIVE_CLASS_CLOSED,
        live.status === 'scheduled' ? 'This class has not opened yet' : 'This class is no longer live',
        { opensAt: live.status === 'scheduled' ? opensAt.toISOString() : null, status: live.status },
      );
    }
    await this.prisma.liveAttendance.upsert({
      where: { liveClassId_userId: { liveClassId: id, userId } },
      create: { liveClassId: id, userId, firstJoinedAt: now, lastJoinedAt: now },
      update: { lastJoinedAt: now, joins: { increment: 1 } },
    });
    if (live.provider === 'youtube') {
      const videoId = parseYouTubeId(live.joinUrl);
      return {
        provider: 'youtube' as const,
        embedUrl: videoId
          ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`
          : live.joinUrl,
        joinUrl: live.joinUrl,
        passcode: null,
      };
    }
    return { provider: 'zoom' as const, embedUrl: null, joinUrl: live.joinUrl, passcode: live.passcode };
  }

  /** The recording, for students who may watch the class. */
  async recording(userId: string, id: string, now = new Date()) {
    const live = await this.studentClass(id, now);
    await this.assertAccess(userId, live, now);
    if (!live.recording) throw Errors.notFound('Recording');
    return this.video.playback(live.recording);
  }

  // ───────────── Worker ─────────────

  /**
   * Every run (D-072): the "starting soon" reminder, classes that reach their start time go live (and students are
   * told), and classes still live well after their planned end are ended. Each step claims its rows first, so two
   * workers never notify twice (the notifications' source keys also make sends once-only).
   */
  async dispatchDue(now = new Date()) {
    const rules = await this.settings.get('live.rules');
    const published = { deletedAt: null, publishedAt: { not: null } };
    let reminded = 0;
    let started = 0;
    let ended = 0;

    const soon = await this.prisma.liveClass.findMany({
      where: {
        ...published,
        status: 'scheduled',
        startsAt: { gt: now, lte: new Date(now.getTime() + rules.reminderMinutes * MINUTE) },
      },
    });
    for (const live of soon) {
      if (live.remindedFor?.getTime() === live.startsAt.getTime()) continue;
      const claimed = await this.prisma.liveClass.updateMany({
        where: {
          id: live.id,
          status: 'scheduled',
          OR: [{ remindedFor: null }, { remindedFor: { not: live.startsAt } }],
        },
        data: { remindedFor: live.startsAt },
      });
      if (!claimed.count) continue;
      await this.notifications.notify(await this.recipients(live), liveReminderMessage(this.ref(live), now));
      reminded += 1;
    }

    const due = await this.prisma.liveClass.findMany({
      where: { ...published, status: 'scheduled', startsAt: { lte: now } },
    });
    for (const live of due) {
      const claimed = await this.prisma.liveClass.updateMany({
        where: { id: live.id, status: 'scheduled' },
        data: { status: 'live', startedAt: now },
      });
      if (!claimed.count) continue;
      await this.notifications.notify(await this.recipients(live), liveNowMessage(this.ref(live)));
      started += 1;
    }

    const running = await this.prisma.liveClass.findMany({ where: { deletedAt: null, status: 'live' } });
    for (const live of running) {
      const over = live.startsAt.getTime() + (live.durationMinutes + rules.endGraceMinutes) * MINUTE;
      if (now.getTime() < over) continue;
      const claimed = await this.prisma.liveClass.updateMany({
        where: { id: live.id, status: 'live' },
        data: { status: 'ended', endedAt: now },
      });
      ended += claimed.count;
    }
    return { reminded, started, ended };
  }

  // ───────────── Helpers ─────────────

  /** Published classes of courses students can see. */
  private studentWhere(now = new Date()): Prisma.LiveClassWhereInput {
    return { deletedAt: null, publishedAt: { not: null }, course: liveWhere(now) };
  }

  private async studentClass(id: string, now = new Date()): Promise<LiveWithRefs> {
    const live = await this.prisma.liveClass.findFirst({ where: { id, ...this.studentWhere(now) }, include });
    if (!live) throw Errors.notFound('Live class');
    return live;
  }

  private async staffClass(id: string, actor: ContentActor): Promise<LiveWithRefs> {
    const live = await this.prisma.liveClass.findFirst({
      where: { id, deletedAt: null },
      include: { ...include, _count: { select: { attendance: true } } },
    });
    if (!live) throw Errors.notFound('Live class');
    await this.scope.assertCourse(actor, live.courseId);
    return live;
  }

  private async assertAccess(userId: string, live: LiveWithRefs, now: Date) {
    const [user, verification] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.settings.get('auth.verification'),
    ]);
    if (verification.requiredForLearning && !user.emailVerifiedAt && !user.phoneVerifiedAt) {
      throw verificationRequired();
    }
    if (live.accessLevel === 'premium') {
      const premium = await this.entitlements.premiumCourseIds(userId, now);
      if (!premium.has(live.courseId)) throw locked();
    }
  }

  private async checkInput(input: LiveClassInput, actor: ContentActor) {
    const course = await this.prisma.course.findFirst({
      where: { id: input.courseId, deletedAt: null },
      select: { id: true },
    });
    if (!course) throw Errors.validation([{ path: 'courseId', message: 'Choose a course' }]);
    await this.scope.assertCourse(actor, course.id);
    if (input.provider === 'youtube' && !parseYouTubeId(input.joinUrl)) {
      throw Errors.validation([{ path: 'joinUrl', message: 'Use the YouTube link of the live stream' }]);
    }
    if (input.instructorId) {
      const staff = await this.prisma.user.findFirst({
        where: { id: input.instructorId, kind: 'staff' },
        select: { id: true },
      });
      if (!staff) throw Errors.validation([{ path: 'instructorId', message: 'Choose a staff member' }]);
    }
  }

  private data(input: LiveClassInput) {
    return {
      courseId: input.courseId,
      title: input.title as Prisma.InputJsonValue,
      description: (input.description ?? Prisma.DbNull) as Prisma.InputJsonValue,
      provider: input.provider,
      joinUrl: input.joinUrl,
      passcode: input.provider === 'zoom' ? input.passcode : null,
      startsAt: new Date(input.startsAt),
      durationMinutes: input.durationMinutes,
      accessLevel: input.accessLevel,
      instructorId: input.instructorId,
    };
  }

  /** The audit keeps what changed, without the meeting link and passcode. */
  private auditable(input: LiveClassInput) {
    const { joinUrl: _url, passcode: _passcode, ...rest } = input;
    return rest;
  }

  private ref(live: LiveClass) {
    return { id: live.id, title: live.title as LocalizedText, startsAt: live.startsAt };
  }

  /** Who hears about a class: everyone with access to the course; for a Premium class, premium access only. */
  private recipients(live: LiveClass) {
    return this.entitlements.studentIdsWithCourses([live.courseId], new Date(), {
      premiumOnly: live.accessLevel === 'premium',
    });
  }

  private async attendedIds(userId: string, ids: string[]) {
    if (!ids.length) return new Set<string>();
    const rows = await this.prisma.liveAttendance.findMany({
      where: { userId, liveClassId: { in: ids } },
      select: { liveClassId: true },
    });
    return new Set(rows.map((r) => r.liveClassId));
  }

  private common(l: LiveWithRefs) {
    return {
      id: l.id,
      course: { id: l.course.id, slug: l.course.slug, title: l.course.title as LocalizedText },
      title: l.title as LocalizedText,
      description: (l.description ?? null) as LocalizedText | null,
      provider: l.provider,
      startsAt: l.startsAt.toISOString(),
      endsAt: new Date(l.startsAt.getTime() + l.durationMinutes * MINUTE).toISOString(),
      durationMinutes: l.durationMinutes,
      accessLevel: l.accessLevel,
      instructor: l.instructor ? { name: l.instructor.fullName } : null,
      status: l.status,
      hasRecording: Boolean(l.recording),
    };
  }

  private studentView(
    l: LiveWithRefs,
    premium: Set<string>,
    joinOpensMinutes: number,
    now: Date,
    attended: Set<string>,
  ) {
    const access = l.accessLevel === 'free' || premium.has(l.courseId);
    return {
      ...this.common(l),
      access,
      joinOpensAt: joinOpensAt(l, joinOpensMinutes).toISOString(),
      canJoin: access && joinOpen(l, joinOpensMinutes, now),
      attended: attended.has(l.id),
    };
  }

  private adminView(l: LiveWithRefs, _now: Date) {
    return {
      ...this.common(l),
      instructorId: l.instructorId,
      joinUrl: l.joinUrl,
      passcode: l.passcode,
      published: Boolean(l.publishedAt),
      publishedAt: l.publishedAt?.toISOString() ?? null,
      startedAt: l.startedAt?.toISOString() ?? null,
      endedAt: l.endedAt?.toISOString() ?? null,
      cancelledAt: l.cancelledAt?.toISOString() ?? null,
      recording: l.recording
        ? { provider: l.recording.provider, videoId: l.recording.providerVideoId, title: l.recording.title }
        : null,
      attendance: l._count?.attendance ?? 0,
    };
  }
}
