import { Injectable } from '@nestjs/common';
import type { BookmarkTarget, LocalizedText, Platform, PracticeQuery, QuestionContent } from '@tk/contracts';
import { Errors } from '../../common/errors/app-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { MediaService } from '../media/media.service.js';
import { stemPreview } from '../questions/questions.service.js';
import { CatalogService, type Viewer } from './catalog.service.js';
import { EntitlementsService } from './entitlements.service.js';
import { mediaIdsIn, splitQuestion } from './practice-view.js';
import { liveWhere, publishedWhere } from './publishing.js';

/** A question is shown to students when it is published and its topic (if any) is published too. */
const visibleQuestion: Prisma.QuestionWhereInput = {
  deletedAt: null,
  status: 'published',
  currentVersionId: { not: null },
  OR: [{ topicId: null }, { topic: { ...publishedWhere, chapter: publishedWhere } }],
};
/** A learning item is shown when it and its whole chain are live. */
const visibleItem = (): Prisma.LearningItemWhereInput => ({
  ...liveWhere(),
  topic: { ...publishedWhere, chapter: { ...publishedWhere, subject: publishedWhere } },
});

const questionInclude = {
  currentVersion: true,
  group: true,
  sources: { include: { examNode: true } },
} satisfies Prisma.QuestionInclude;
type QuestionRow = Prisma.QuestionGetPayload<{ include: typeof questionInclude }>;

type Subject = { id: string; name: LocalizedText };
export type BookmarkView =
  | {
      targetType: 'learning_item';
      id: string;
      createdAt: string;
      itemType: 'note' | 'pdf' | 'video';
      title: LocalizedText;
      subject: Subject;
    }
  | { targetType: 'question'; id: string; createdAt: string; preview: string; subject: Subject };

/**
 * Practice questions with model answers (locked answers are never sent), bookmarks and search for students.
 * Practice is not scored on the server: entitled students receive the answer key and the app checks locally
 * with the shared scoring engine (@tk/domain).
 */
@Injectable()
export class PracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly entitlements: EntitlementsService,
    private readonly media: MediaService,
  ) {}

  async subjectQuestions(courseId: string, subjectId: string, viewer: Viewer, query: PracticeQuery) {
    await this.catalog.assertSubjectInCourse(courseId, subjectId, viewer);
    await this.catalog.assertVerifiedForLearning(viewer);
    const hasAccess = await this.entitlements.hasSubjectAccess(viewer.userId, subjectId);
    const rows = await this.prisma.question.findMany({
      where: {
        ...visibleQuestion,
        subjectId,
        ...(query.topicId
          ? { topicId: query.topicId }
          : query.chapterId
            ? { topic: { chapterId: query.chapterId } }
            : {}),
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      include: questionInclude,
      orderBy: { id: 'asc' },
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const views = page.map((q) => this.view(q, hasAccess));
    return {
      data: views,
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      media: await this.media.publicImageUrls([...mediaIdsIn(views)]),
    };
  }

  /** One question (from a bookmark or search). Access is decided by the student's access to its subject. */
  async question(id: string, viewer: Viewer) {
    await this.catalog.assertVerifiedForLearning(viewer);
    const q = await this.prisma.question.findFirst({
      where: { ...visibleQuestion, id },
      include: questionInclude,
    });
    if (!q) throw Errors.notFound('Question');
    const view = this.view(q, await this.entitlements.hasSubjectAccess(viewer.userId, q.subjectId));
    return { ...view, media: await this.media.publicImageUrls([...mediaIdsIn(view)]) };
  }

  private view(q: QuestionRow, hasSubjectAccess: boolean) {
    const locked = q.accessLevel === 'premium' && !hasSubjectAccess;
    const { question, answer } = splitQuestion(q.currentVersion!.content as QuestionContent);
    return {
      id: q.id,
      subjectId: q.subjectId,
      topicId: q.topicId,
      difficulty: q.difficulty,
      marks: Number(q.defaultMarks),
      accessLevel: q.accessLevel,
      locked,
      isPyq: q.isPyq,
      sources: q.sources.map((s) => ({
        yearBs: s.yearBs,
        examNode: s.examNode ? { id: s.examNode.id, name: s.examNode.name as LocalizedText } : null,
      })),
      passage:
        q.group && !q.group.deletedAt
          ? {
              id: q.group.id,
              title: (q.group.title as LocalizedText | null) ?? null,
              content: q.group.passage,
            }
          : null,
      question,
      // Rule 5: nothing of the answer leaves the server for a locked question.
      answer: locked ? null : answer,
    };
  }

  // ───────────── Bookmarks ─────────────

  async addBookmark(userId: string, targetType: BookmarkTarget, targetId: string) {
    const exists =
      targetType === 'question'
        ? await this.prisma.question.count({ where: { ...visibleQuestion, id: targetId } })
        : await this.prisma.learningItem.count({ where: { ...visibleItem(), id: targetId } });
    if (!exists) throw Errors.notFound(targetType === 'question' ? 'Question' : 'Item');
    await this.prisma.bookmark.createMany({ data: [{ userId, targetType, targetId }], skipDuplicates: true });
  }

  async removeBookmark(userId: string, targetType: BookmarkTarget, targetId: string) {
    await this.prisma.bookmark.deleteMany({ where: { userId, targetType, targetId } });
  }

  /** Newest first; bookmarks whose lesson or question is no longer published are left out. */
  async bookmarks(userId: string) {
    const rows = await this.prisma.bookmark.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const ids = (type: BookmarkTarget) => rows.filter((r) => r.targetType === type).map((r) => r.targetId);
    const [items, questions] = await Promise.all([
      this.prisma.learningItem.findMany({
        where: { ...visibleItem(), id: { in: ids('learning_item') } },
        include: { topic: { select: { chapter: { select: { subject: true } } } } },
      }),
      this.prisma.question.findMany({
        where: { ...visibleQuestion, id: { in: ids('question') } },
        include: { currentVersion: true, subject: true },
      }),
    ]);
    const itemOf = new Map(items.map((i) => [i.id, i]));
    const questionOf = new Map(questions.map((q) => [q.id, q]));
    return rows.flatMap((r): BookmarkView[] => {
      if (r.targetType === 'learning_item') {
        const i = itemOf.get(r.targetId);
        if (!i) return [];
        const subject = i.topic.chapter.subject;
        return [
          {
            targetType: 'learning_item',
            id: i.id,
            createdAt: r.createdAt.toISOString(),
            itemType: i.type,
            title: i.title as LocalizedText,
            subject: { id: subject.id, name: subject.name as LocalizedText },
          },
        ];
      }
      const q = questionOf.get(r.targetId);
      if (!q) return [];
      return [
        {
          targetType: 'question',
          id: q.id,
          createdAt: r.createdAt.toISOString(),
          preview: stemPreview(q.currentVersion?.content as QuestionContent | undefined),
          subject: { id: q.subject.id, name: q.subject.name as LocalizedText },
        },
      ];
    });
  }

  // ───────────── Search ─────────────

  /** Courses, lessons and practice questions whose title or text contains the words (both languages). */
  async search(q: string, platform: Platform) {
    const text = (path: 'en' | 'ne') => ({
      title: { path: [path], string_contains: q, mode: 'insensitive' as const },
    });
    const [courses, items, questions] = await Promise.all([
      this.catalog.listCourses({ q, limit: 10, platform }),
      this.prisma.learningItem.findMany({
        where: { ...visibleItem(), OR: [text('en'), text('ne')] },
        include: { topic: { select: { chapter: { select: { subject: true } } } } },
        orderBy: { id: 'asc' },
        take: 10,
      }),
      this.prisma.question.findMany({
        where: { ...visibleQuestion, searchText: { contains: q, mode: 'insensitive' } },
        include: { currentVersion: true, subject: true },
        orderBy: { id: 'asc' },
        take: 10,
      }),
    ]);
    return {
      courses: courses.data,
      items: items.map((i) => ({
        id: i.id,
        type: i.type,
        title: i.title as LocalizedText,
        accessLevel: i.accessLevel,
        subject: { id: i.topic.chapter.subject.id, name: i.topic.chapter.subject.name as LocalizedText },
      })),
      questions: questions.map((x) => ({
        id: x.id,
        preview: stemPreview(x.currentVersion?.content as QuestionContent | undefined),
        accessLevel: x.accessLevel,
        subject: { id: x.subject.id, name: x.subject.name as LocalizedText },
      })),
    };
  }
}
