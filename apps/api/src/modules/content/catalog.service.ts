import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type LearningProgressInput,
  type LocalizedRichDoc,
  type LocalizedText,
  type Platform,
  type RatingSummary,
} from '@tk/contracts';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { Prisma, type Course, type MediaAsset } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { CertificatesService } from '../certificates/certificates.service.js';
import { MediaService } from '../media/media.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { courseProgress } from './course-progress.js';
import { EntitlementsService, isFreeEnrollable } from './entitlements.service.js';
import { isLive, liveWhere, publishedWhere } from './publishing.js';
import { watermarkPdf } from './pdf-watermark.js';
import { VideoService } from './video.service.js';
import { CourseInterestsService } from '../notifications/course-interests.service.js';
import { ReviewsService } from '../reviews/reviews.service.js';

const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));
const locked = () => new AppError(403, ErrorCode.CONTENT_LOCKED, 'This content is part of a premium course');
const verificationRequired = () =>
  new AppError(403, ErrorCode.VERIFICATION_REQUIRED, 'Verify your email or phone to start learning');

export interface Viewer {
  userId: string;
  /** The signed-in session, when the caller has one (course interest from Apple devices, D-061). */
  sessionId?: string;
}

type CourseWithThumb = Course & { thumbnail: MediaAsset | null };

/**
 * Student-facing reads. Only live content is listed; premium bodies, PDFs and playback URLs are returned only to
 * entitled students (rule 5 — no "blur on the client"). Prices are omitted where the platform cannot sell (D-027).
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly media: MediaService,
    private readonly settings: SettingsService,
    private readonly entitlements: EntitlementsService,
    private readonly video: VideoService,
    private readonly certificates: CertificatesService,
    private readonly interests: CourseInterestsService,
    private readonly reviews: ReviewsService,
  ) {}

  // ───────────── Courses ─────────────

  async listCourses(params: {
    examNodeId?: string;
    q?: string;
    featured?: boolean;
    cursor?: string;
    limit: number;
    platform: Platform;
  }) {
    const nodeIds = params.examNodeId ? await this.nodeAndDescendants(params.examNodeId) : null;
    const where: Prisma.CourseWhereInput = {
      ...liveWhere(),
      ...(params.featured ? { isFeatured: true } : {}),
      ...(nodeIds ? { examNodes: { some: { examNodeId: { in: nodeIds } } } } : {}),
      ...(params.q
        ? {
            AND: [
              {
                OR: [
                  { title: { path: ['en'], string_contains: params.q, mode: 'insensitive' } },
                  { title: { path: ['ne'], string_contains: params.q } },
                ],
              },
            ],
          }
        : {}),
      ...(params.cursor ? { id: { lt: params.cursor } } : {}),
    };
    const rows = await this.prisma.course.findMany({
      where,
      include: { thumbnail: true },
      orderBy: [{ popularityRank: { sort: 'asc', nulls: 'last' } }, { id: 'desc' }],
      take: params.limit + 1,
    });
    const page = rows.slice(0, params.limit);
    const [purchasable, ratings] = await Promise.all([
      this.purchasable(params.platform),
      this.reviews.ratings(page.map((c) => c.id)),
    ]);
    return {
      data: page.map((c) => this.courseCard(c, purchasable, ratings.get(c.id))),
      nextCursor: rows.length > params.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async courseDetail(slug: string, platform: Platform, viewer: Viewer | null) {
    const course = await this.prisma.course.findFirst({
      where: { slug, deletedAt: null },
      include: {
        thumbnail: true,
        subjects: {
          orderBy: { sortOrder: 'asc' },
          where: { subject: publishedWhere },
          include: { subject: { include: { icon: true } }, paper: true },
        },
        examNodes: { where: { examNode: publishedWhere }, include: { examNode: true } },
        instructors: {
          orderBy: { sortOrder: 'asc' },
          include: { user: { include: { instructorProfile: { include: { photo: true } } } } },
        },
      },
    });
    const entitled =
      viewer && course ? (await this.entitlements.activeCourseIds(viewer.userId)).has(course.id) : false;
    // Students who have access keep seeing archived courses; everyone else only sees live ones.
    if (!course || (!isLive(course) && !entitled)) throw Errors.notFound('Course');

    const subjectIds = course.subjects.map((s) => s.subjectId);
    const counts = await this.prisma.learningItem.groupBy({
      by: ['type'],
      where: {
        ...liveWhere(),
        topic: { ...publishedWhere, chapter: { ...publishedWhere, subjectId: { in: subjectIds } } },
      },
      _count: { _all: true },
    });
    const purchasable = await this.purchasable(platform);
    // D-061: an Apple device cannot buy here; note the interest so staff can email the website link.
    if (viewer?.sessionId && platform === 'ios' && !entitled && course.pricePaisa > 0 && isLive(course)) {
      await this.interests.record(viewer.userId, viewer.sessionId, course.id);
    }
    return {
      ...this.courseCard(course, purchasable, (await this.reviews.ratings([course.id])).get(course.id)),
      description: (course.description as LocalizedRichDoc | null) ?? null,
      descriptionMedia: await this.media.publicImageUrls(this.richMediaIds(course.description)),
      language: course.language,
      validity: {
        type: course.validityType,
        days: course.validityDays,
        endsOn: course.validityEndsOn?.toISOString().slice(0, 10) ?? null,
      },
      contentCounts: Object.fromEntries(counts.map((c) => [c.type, c._count._all])) as Partial<
        Record<'note' | 'pdf' | 'video', number>
      >,
      subjects: course.subjects.map((s) => ({
        id: s.subjectId,
        name: s.subject.name as LocalizedText,
        summary: (s.subject.summary as LocalizedText | null) ?? null,
        iconUrl: s.subject.icon ? this.storage.publicUrl(s.subject.icon.objectKey) : null,
        fullMarks: num(s.displayFullMarks) ?? num(s.paper?.fullMarks ?? null),
        passMarks: num(s.displayPassMarks) ?? num(s.paper?.passMarks ?? null),
        durationMinutes: s.displayDurationMinutes ?? s.paper?.durationMinutes ?? null,
      })),
      examNodes: course.examNodes.map((e) => ({
        id: e.examNode.id,
        name: e.examNode.name as LocalizedText,
        nodeType: e.examNode.nodeType,
      })),
      instructors: course.instructors
        .filter((i) => i.user.instructorProfile?.isPublic)
        .map((i) => ({
          id: i.user.id,
          displayName: i.user.instructorProfile!.displayName as LocalizedText,
          bio: (i.user.instructorProfile!.bio as LocalizedText | null) ?? null,
          photoUrl: i.user.instructorProfile!.photo
            ? this.storage.publicUrl(i.user.instructorProfile!.photo.objectKey)
            : null,
        })),
      // Free courses are joined with POST /courses/:id/enrol (L6); entitled students skip it.
      access: viewer
        ? {
            entitled,
            canEnrol: !entitled && isFreeEnrollable(course),
            certificate: await this.certificates.forCourse(viewer.userId, course.id),
          }
        : null,
    };
  }

  async myCourses(viewer: Viewer) {
    const ids = await this.entitlements.activeCourseIds(viewer.userId);
    if (ids.size === 0) return [];
    const courses = await this.prisma.course.findMany({
      where: { id: { in: [...ids] }, deletedAt: null },
      include: { thumbnail: true },
      orderBy: { updatedAt: 'desc' },
    });
    const progress = await courseProgress(
      this.prisma,
      viewer.userId,
      courses.map((c) => c.id),
    );
    const ratings = await this.reviews.ratings(courses.map((c) => c.id));
    return courses.map((c) => ({
      ...this.courseCard(c, false, ratings.get(c.id)),
      progress: progress.get(c.id) ?? { completed: 0, total: 0 },
    }));
  }

  /** Chapters → topics → items with lock state, for one subject of one course. */
  async subjectOutline(courseId: string, subjectId: string, viewer: Viewer) {
    await this.assertSubjectInCourse(courseId, subjectId, viewer);
    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, ...publishedWhere },
      include: {
        chapters: {
          where: publishedWhere,
          orderBy: { sortOrder: 'asc' },
          include: {
            topics: {
              where: publishedWhere,
              orderBy: { sortOrder: 'asc' },
              include: {
                items: {
                  where: liveWhere(),
                  orderBy: { sortOrder: 'asc' },
                  include: { pdf: { select: { pageCount: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!subject) throw Errors.notFound('Subject');
    const hasAccess = await this.entitlements.hasSubjectAccess(viewer.userId, subjectId);
    const itemIds = subject.chapters.flatMap((c) => c.topics.flatMap((t) => t.items.map((i) => i.id)));
    const progressRows = await this.prisma.learningProgress.findMany({
      where: { userId: viewer.userId, learningItemId: { in: itemIds } },
    });
    const progressOf = new Map(progressRows.map((r) => [r.learningItemId, r]));
    return {
      id: subject.id,
      name: subject.name as LocalizedText,
      hasPremiumAccess: hasAccess,
      chapters: subject.chapters.map((c) => ({
        id: c.id,
        numberLabel: c.numberLabel,
        title: c.title as LocalizedText,
        estimatedMinutes: c.estimatedMinutes,
        topics: c.topics.map((t) => ({
          id: t.id,
          numberLabel: t.numberLabel,
          title: t.title as LocalizedText,
          description: (t.description as LocalizedText | null) ?? null,
          items: t.items.map((i) => ({
            id: i.id,
            type: i.type,
            title: i.title as LocalizedText,
            accessLevel: i.accessLevel,
            locked: i.accessLevel === 'premium' && !hasAccess,
            durationSeconds: i.durationSeconds,
            pageCount: i.pdf?.pageCount ?? null,
            progress: progressOf.has(i.id)
              ? {
                  position: progressOf.get(i.id)!.position,
                  completed: progressOf.get(i.id)!.completedAt !== null,
                }
              : null,
          })),
        })),
      })),
    };
  }

  // ───────────── Learning items ─────────────

  async itemContent(itemId: string, viewer: Viewer) {
    const { item } = await this.accessibleItem(itemId, viewer);
    const base = {
      id: item.id,
      type: item.type,
      title: item.title as LocalizedText,
      accessLevel: item.accessLevel,
      language: item.language,
      durationSeconds: item.durationSeconds,
      /** The lesson's last change (offline copies compare it, T-069). */
      version: item.updatedAt.toISOString(),
    };
    if (item.type === 'note') {
      const content = item.noteContent as LocalizedRichDoc | null;
      return {
        ...base,
        noteContent: content,
        media: await this.media.publicImageUrls(this.richMediaIds(content)),
      };
    }
    if (item.type === 'pdf') {
      return { ...base, pageCount: item.pdf?.pageCount ?? null, downloadable: item.downloadable };
    }
    return { ...base, video: { provider: item.video?.provider ?? null, status: item.video?.status ?? null } };
  }

  async itemPdf(itemId: string, viewer: Viewer, wantsDownload: boolean) {
    const { item, user } = await this.accessibleItem(itemId, viewer);
    if (item.type !== 'pdf' || !item.pdf) throw Errors.notFound('PDF');
    if (wantsDownload && !item.downloadable) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'This PDF can be read in the app but not downloaded');
    }
    const original = await this.storage.getBuffer('private', item.pdf.objectKey);
    const label = `Licensed to ${user.email ?? user.phone ?? 'student'} - ID ${user.id.slice(0, 8)} - ${new Date().toISOString().slice(0, 10)} - Tayari Kakshya`;
    const body = await watermarkPdf(original, label);
    const filename = `${((item.title as LocalizedText).en ?? 'notes').replace(/[^\w.\- ]/g, '_').slice(0, 80)}.pdf`;
    return { body, filename, disposition: wantsDownload ? 'attachment' : 'inline' };
  }

  async itemPlayback(itemId: string, viewer: Viewer) {
    const { item } = await this.accessibleItem(itemId, viewer);
    if (item.type !== 'video' || !item.video) throw Errors.notFound('Video');
    if (item.video.status !== 'ready') {
      throw new AppError(
        409,
        ErrorCode.CONFLICT,
        'This video is still being processed. Please try again later.',
      );
    }
    return this.video.playback(item.video);
  }

  // ───────────── Progress ─────────────

  /**
   * Saves where the student is in an item (video seconds / PDF page) and/or that it is finished. Finishing is
   * permanent; positions keep moving. The same access rules as opening the item apply. Finishing an item can earn
   * course certificates (D-050); those issued now are returned so the app can say so.
   */
  async recordProgress(itemId: string, viewer: Viewer, input: LearningProgressInput) {
    const { item } = await this.accessibleItem(itemId, viewer);
    if (input.courseId) {
      const linked = await this.prisma.courseSubject.findFirst({
        where: {
          courseId: input.courseId,
          subjectId: item.topic.chapter.subjectId,
          course: { deletedAt: null },
        },
      });
      if (!linked) {
        throw Errors.validation([{ path: 'courseId', message: 'This item is not part of that course' }]);
      }
    }
    const key = { userId: viewer.userId, learningItemId: item.id };
    const existing = await this.prisma.learningProgress.findUnique({ where: { userId_learningItemId: key } });
    const completedAt = existing?.completedAt ?? (input.completed ? new Date() : null);
    const data = {
      ...(input.courseId ? { courseId: input.courseId } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      completedAt,
    };
    const row = existing
      ? await this.prisma.learningProgress.update({ where: { userId_learningItemId: key }, data })
      : await this.prisma.learningProgress.create({ data: { ...key, ...data } });
    const finishedNow = !existing?.completedAt && row.completedAt !== null;
    return {
      position: row.position,
      completed: row.completedAt !== null,
      newCertificates: finishedNow ? await this.certificates.issueEarned(viewer.userId) : [],
    };
  }

  /** The most recently opened unfinished item the student can still open, with where it was opened from. */
  async continueLearning(viewer: Viewer) {
    const recent = await this.prisma.learningProgress.findMany({
      where: { userId: viewer.userId, completedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      include: { course: true },
    });
    const entitled = await this.entitlements.activeCourseIds(viewer.userId);
    for (const row of recent) {
      const item = await this.accessibleItem(row.learningItemId, viewer)
        .then((r) => r.item)
        .catch(() => null);
      if (!item) continue;
      const subject = await this.prisma.subject.findUniqueOrThrow({
        where: { id: item.topic.chapter.subjectId },
      });
      const course = row.course && (isLive(row.course) || entitled.has(row.course.id)) ? row.course : null;
      return {
        item: {
          id: item.id,
          type: item.type,
          title: item.title as LocalizedText,
          position: row.position,
          durationSeconds: item.durationSeconds,
          pageCount: item.pdf?.pageCount ?? null,
        },
        subject: { id: subject.id, name: subject.name as LocalizedText },
        course: course ? { id: course.id, slug: course.slug, title: course.title as LocalizedText } : null,
      };
    }
    return null;
  }

  // ───────────── helpers ─────────────

  /** The subject is part of a course the viewer may browse (live, or archived but still entitled). */
  async assertSubjectInCourse(courseId: string, subjectId: string, viewer: Viewer): Promise<void> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null, subjects: { some: { subjectId } } },
    });
    const entitledCourses = await this.entitlements.activeCourseIds(viewer.userId);
    if (!course || (!isLive(course) && !entitledCourses.has(courseId))) throw Errors.notFound('Subject');
  }

  /** When the CMS requires verification for learning (D-029), unverified students cannot open content. */
  async assertVerifiedForLearning(viewer: Viewer): Promise<void> {
    const [user, verification] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: viewer.userId } }),
      this.settings.get('auth.verification'),
    ]);
    if (verification.requiredForLearning && !user.emailVerifiedAt && !user.phoneVerifiedAt) {
      throw verificationRequired();
    }
  }

  /** Loads a live item in a live chain and enforces verification + premium access. */
  private async accessibleItem(itemId: string, viewer: Viewer) {
    const [item, user, verification] = await Promise.all([
      this.prisma.learningItem.findFirst({
        where: {
          id: itemId,
          ...liveWhere(),
          topic: { ...publishedWhere, chapter: { ...publishedWhere, subject: publishedWhere } },
        },
        include: { pdf: true, video: true, topic: { select: { chapter: { select: { subjectId: true } } } } },
      }),
      this.prisma.user.findUniqueOrThrow({ where: { id: viewer.userId } }),
      this.settings.get('auth.verification'),
    ]);
    if (!item) throw Errors.notFound('Item');
    if (verification.requiredForLearning && !user.emailVerifiedAt && !user.phoneVerifiedAt) {
      throw verificationRequired();
    }
    if (item.accessLevel === 'premium') {
      const ok = await this.entitlements.hasSubjectAccess(viewer.userId, item.topic.chapter.subjectId);
      if (!ok) throw locked();
    }
    return { item, user };
  }

  private async nodeAndDescendants(rootId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE tree AS (
        SELECT id FROM exam_nodes WHERE id = ${rootId}::uuid AND deleted_at IS NULL AND status = 'published'
        UNION ALL
        SELECT n.id FROM exam_nodes n JOIN tree t ON n.parent_id = t.id
        WHERE n.deleted_at IS NULL AND n.status = 'published'
      )
      SELECT id FROM tree`;
    return rows.map((r) => r.id);
  }

  /** D-027: prices only where this platform's purchase channel sells in the app/site. */
  private async purchasable(platform: Platform): Promise<boolean> {
    const channels = await this.settings.get('purchase.channels');
    if (platform === 'ios') return false;
    if (platform === 'android') return channels.android === 'in_app';
    return channels.web === 'enabled';
  }

  private courseCard(c: CourseWithThumb, purchasable: boolean, rating?: RatingSummary) {
    const now = new Date();
    const saleActive =
      c.salePricePaisa !== null &&
      (!c.saleStartsAt || c.saleStartsAt <= now) &&
      (!c.saleEndsAt || c.saleEndsAt > now);
    return {
      id: c.id,
      slug: c.slug,
      title: c.title as LocalizedText,
      shortDescription: (c.shortDescription as LocalizedText | null) ?? null,
      thumbnailUrl: c.thumbnail ? this.storage.publicUrl(c.thumbnail.objectKey) : null,
      isFeatured: c.isFeatured,
      isFree: c.pricePaisa === 0,
      /** Approved reviews only (D-066); null until a review is approved. */
      rating: rating ?? null,
      pricing: purchasable
        ? {
            pricePaisa: c.pricePaisa,
            salePricePaisa: saleActive ? c.salePricePaisa : null,
            saleEndsAt: saleActive ? (c.saleEndsAt?.toISOString() ?? null) : null,
            effectivePricePaisa: saleActive ? (c.salePricePaisa as number) : c.pricePaisa,
          }
        : null,
    };
  }

  private richMediaIds(content: unknown): string[] {
    const doc = content as LocalizedRichDoc | null;
    if (!doc) return [];
    const ids = new Set<string>();
    const walk = (node: { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }) => {
      if (node?.type === 'image' && typeof node.attrs?.['mediaId'] === 'string')
        ids.add(node.attrs['mediaId']);
      node?.content?.forEach((c) => walk(c as typeof node));
    };
    if (doc.en) walk(doc.en as never);
    if (doc.ne) walk(doc.ne as never);
    return [...ids];
  }
}
