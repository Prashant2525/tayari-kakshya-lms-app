import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type AdminListQuery,
  type ChapterInput,
  type LocalizedText,
  type PublishStatus,
  type SubjectInput,
  type TopicInput,
} from '@tk/contracts';
import { Errors } from '../../common/errors/app-error.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MediaService } from '../media/media.service.js';
import { assertCanSetStatus } from './publishing.js';
import { assertCanEditLive, ScopeService, type ContentActor } from './scope.service.js';

const json = (v: unknown) => (v ?? Prisma.DbNull) as Prisma.InputJsonValue;
type Level = 'subject' | 'chapter' | 'topic';

function assertStructuralStatus(status: PublishStatus): void {
  if (status === 'scheduled') {
    throw Errors.validation([
      { path: 'status', message: 'Only notes, PDFs, videos and courses can be scheduled' },
    ]);
  }
}

/** Reusable content tree: Subject → Chapter → Topic (D-010). Learning items live under topics. */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly media: MediaService,
    private readonly storage: StorageService,
  ) {}

  // ───────────── Subjects ─────────────

  async listSubjects(query: AdminListQuery, actor: ContentActor) {
    const allowed = await this.scope.allowedSubjectIds(actor);
    const where: Prisma.SubjectWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.status ? { status: query.status } : {}),
      ...(allowed ? { id: { in: [...allowed] } } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { path: ['en'], string_contains: query.q, mode: 'insensitive' } },
              { name: { path: ['ne'], string_contains: query.q } },
            ],
          }
        : {}),
      ...(query.cursor ? { id: { lt: query.cursor } } : {}),
    };
    const rows = await this.prisma.subject.findMany({
      where,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      include: {
        icon: true,
        _count: { select: { chapters: { where: { deletedAt: null } }, courses: true } },
      },
    });
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((s) => ({
        id: s.id,
        name: s.name as LocalizedText,
        summary: (s.summary as LocalizedText | null) ?? null,
        iconUrl: s.icon ? this.storage.publicUrl(s.icon.objectKey) : null,
        status: s.status,
        deletedAt: s.deletedAt?.toISOString() ?? null,
        chapterCount: s._count.chapters,
        courseCount: s._count.courses,
        updatedAt: s.updatedAt.toISOString(),
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  /** Full editing tree: chapters → topics → item summaries (not bodies). */
  async subjectTree(id: string, actor: ContentActor) {
    await this.scope.assertSubject(actor, id);
    const subject = await this.prisma.subject.findFirst({
      where: { id, deletedAt: null },
      include: {
        icon: true,
        chapters: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          include: {
            topics: {
              where: { deletedAt: null },
              orderBy: { sortOrder: 'asc' },
              include: {
                items: {
                  where: { deletedAt: null },
                  orderBy: { sortOrder: 'asc' },
                  select: {
                    id: true,
                    type: true,
                    title: true,
                    status: true,
                    accessLevel: true,
                    publishAt: true,
                    durationSeconds: true,
                    sortOrder: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!subject) throw Errors.notFound('Subject');
    return {
      id: subject.id,
      name: subject.name as LocalizedText,
      summary: (subject.summary as LocalizedText | null) ?? null,
      iconMediaId: subject.iconMediaId,
      iconUrl: subject.icon ? this.storage.publicUrl(subject.icon.objectKey) : null,
      status: subject.status,
      chapters: subject.chapters.map((c) => ({
        id: c.id,
        numberLabel: c.numberLabel,
        title: c.title as LocalizedText,
        description: (c.description as LocalizedText | null) ?? null,
        estimatedMinutes: c.estimatedMinutes,
        status: c.status,
        topics: c.topics.map((t) => ({
          id: t.id,
          numberLabel: t.numberLabel,
          title: t.title as LocalizedText,
          description: (t.description as LocalizedText | null) ?? null,
          estimatedMinutes: t.estimatedMinutes,
          status: t.status,
          items: t.items.map((i) => ({
            ...i,
            title: i.title as LocalizedText,
            publishAt: i.publishAt?.toISOString() ?? null,
          })),
        })),
      })),
    };
  }

  async createSubject(input: SubjectInput, actor: ContentActor) {
    await this.scope.assertUnscoped(actor);
    await this.media.assertPublicImages([input.iconMediaId]);
    return this.prisma.$transaction(async (tx) => {
      const subject = await tx.subject.create({
        data: {
          name: input.name,
          summary: json(input.summary),
          iconMediaId: input.iconMediaId ?? null,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      await this.log(tx, actor, 'subject.create', 'subject', subject.id, { after: input });
      return { id: subject.id };
    });
  }

  async updateSubject(id: string, input: SubjectInput, actor: ContentActor) {
    await this.scope.assertSubject(actor, id);
    const before = await this.find('subject', id);
    assertCanEditLive(actor, before.status, 'content:publish');
    await this.media.assertPublicImages([input.iconMediaId]);
    await this.prisma.$transaction(async (tx) => {
      await tx.subject.update({
        where: { id },
        data: {
          name: input.name,
          summary: json(input.summary),
          iconMediaId: input.iconMediaId ?? null,
          updatedById: actor.userId,
        },
      });
      await this.log(tx, actor, 'subject.update', 'subject', id, {
        before: { name: before.name },
        after: input,
      });
    });
  }

  // ───────────── Chapters & topics ─────────────

  async createChapter(subjectId: string, input: ChapterInput, actor: ContentActor) {
    await this.scope.assertSubject(actor, subjectId);
    await this.find('subject', subjectId);
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.chapter.aggregate({
        where: { subjectId, deletedAt: null },
        _max: { sortOrder: true },
      });
      const chapter = await tx.chapter.create({
        data: {
          subjectId,
          numberLabel: input.numberLabel ?? null,
          title: input.title,
          description: json(input.description),
          estimatedMinutes: input.estimatedMinutes ?? null,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
      });
      await this.log(tx, actor, 'chapter.create', 'chapter', chapter.id, { after: input });
      return { id: chapter.id };
    });
  }

  async updateChapter(id: string, input: ChapterInput, actor: ContentActor) {
    const chapter = await this.find('chapter', id);
    await this.scope.assertSubject(actor, chapter.subjectId);
    assertCanEditLive(actor, chapter.status, 'content:publish');
    await this.prisma.$transaction(async (tx) => {
      await tx.chapter.update({
        where: { id },
        data: {
          numberLabel: input.numberLabel ?? null,
          title: input.title,
          description: json(input.description),
          estimatedMinutes: input.estimatedMinutes ?? null,
        },
      });
      await this.log(tx, actor, 'chapter.update', 'chapter', id, {
        before: { title: chapter.title },
        after: input,
      });
    });
  }

  async createTopic(chapterId: string, input: TopicInput, actor: ContentActor) {
    const chapter = await this.find('chapter', chapterId);
    await this.scope.assertSubject(actor, chapter.subjectId);
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.topic.aggregate({
        where: { chapterId, deletedAt: null },
        _max: { sortOrder: true },
      });
      const topic = await tx.topic.create({
        data: {
          chapterId,
          numberLabel: input.numberLabel ?? null,
          title: input.title,
          description: json(input.description),
          estimatedMinutes: input.estimatedMinutes ?? null,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
      });
      await this.log(tx, actor, 'topic.create', 'topic', topic.id, { after: input });
      return { id: topic.id };
    });
  }

  async updateTopic(id: string, input: TopicInput, actor: ContentActor) {
    const topic = await this.find('topic', id);
    const subjectId = await this.subjectOfTopic(id);
    await this.scope.assertSubject(actor, subjectId);
    assertCanEditLive(actor, topic.status, 'content:publish');
    await this.prisma.$transaction(async (tx) => {
      await tx.topic.update({
        where: { id },
        data: {
          numberLabel: input.numberLabel ?? null,
          title: input.title,
          description: json(input.description),
          estimatedMinutes: input.estimatedMinutes ?? null,
        },
      });
      await this.log(tx, actor, 'topic.update', 'topic', id, {
        before: { title: topic.title },
        after: input,
      });
    });
  }

  // ───────────── Shared lifecycle (status, delete, restore, reorder) ─────────────

  async setStatus(level: Level, id: string, status: PublishStatus, actor: ContentActor) {
    assertStructuralStatus(status);
    assertCanSetStatus(actor.access, status, 'content:publish');
    const row = await this.find(level, id);
    await this.scope.assertSubject(actor, await this.subjectOf(level, id));
    await this.prisma.$transaction(async (tx) => {
      await this.model(tx, level).update({ where: { id }, data: { status } });
      await this.log(tx, actor, `${level}.status`, level, id, { before: row.status, after: status });
    });
  }

  async remove(level: Level, id: string, actor: ContentActor) {
    assertCanSetStatus(actor.access, 'archived', 'content:publish');
    await this.find(level, id);
    await this.scope.assertSubject(actor, await this.subjectOf(level, id));
    const children =
      level === 'subject'
        ? await this.prisma.chapter.count({ where: { subjectId: id, deletedAt: null } })
        : level === 'chapter'
          ? await this.prisma.topic.count({ where: { chapterId: id, deletedAt: null } })
          : await this.prisma.learningItem.count({ where: { topicId: id, deletedAt: null } });
    if (children > 0) {
      throw Errors.conflict(ErrorCode.CONFLICT, 'Delete or move what is inside it first', { children });
    }
    if (level === 'subject') {
      const courses = await this.prisma.courseSubject.count({ where: { subjectId: id } });
      if (courses > 0)
        throw Errors.conflict(ErrorCode.CONFLICT, 'Courses use this subject; remove it from them first', {
          courses,
        });
    }
    await this.prisma.$transaction(async (tx) => {
      await this.model(tx, level).update({ where: { id }, data: { deletedAt: new Date() } });
      await this.log(tx, actor, `${level}.delete`, level, id);
    });
  }

  async restore(level: Level, id: string, actor: ContentActor) {
    assertCanSetStatus(actor.access, 'archived', 'content:publish');
    const row = await this.findDeleted(level, id);
    await this.scope.assertSubject(actor, await this.subjectOf(level, id));
    if (level !== 'subject') {
      const parentLevel: Level = level === 'chapter' ? 'subject' : 'chapter';
      const parentId =
        level === 'chapter'
          ? (row as unknown as { subjectId: string }).subjectId
          : (row as unknown as { chapterId: string }).chapterId;
      const parent = await this.model(this.prisma, parentLevel).findFirst({
        where: { id: parentId, deletedAt: null },
      });
      if (!parent) throw Errors.conflict(ErrorCode.CONFLICT, `Restore its ${parentLevel} first`);
    }
    await this.prisma.$transaction(async (tx) => {
      await this.model(tx, level).update({ where: { id }, data: { deletedAt: null, status: 'draft' } });
      await this.log(tx, actor, `${level}.restore`, level, id);
    });
  }

  async reorder(level: 'chapter' | 'topic', parentId: string, ids: string[], actor: ContentActor) {
    const subjectId = level === 'chapter' ? parentId : (await this.find('chapter', parentId)).subjectId;
    await this.scope.assertSubject(actor, subjectId);
    const siblings =
      level === 'chapter'
        ? await this.prisma.chapter.findMany({
            where: { subjectId: parentId, deletedAt: null },
            select: { id: true },
          })
        : await this.prisma.topic.findMany({
            where: { chapterId: parentId, deletedAt: null },
            select: { id: true },
          });
    const all = new Set(siblings.map((s) => s.id));
    if (ids.length !== all.size || new Set(ids).size !== ids.length || !ids.every((i) => all.has(i))) {
      throw Errors.validation([{ path: 'ids', message: 'Provide every item at this level exactly once' }]);
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of ids.entries())
        await this.model(tx, level).update({ where: { id }, data: { sortOrder: index } });
      await this.log(tx, actor, `${level}.reorder`, level, parentId, { order: ids });
    });
  }

  // ───────────── helpers ─────────────

  async subjectOfTopic(topicId: string): Promise<string> {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      select: { chapter: { select: { subjectId: true } } },
    });
    if (!topic) throw Errors.notFound('Topic');
    return topic.chapter.subjectId;
  }

  private async subjectOf(level: Level, id: string): Promise<string> {
    if (level === 'subject') return id;
    if (level === 'chapter') {
      const c = await this.prisma.chapter.findUnique({ where: { id }, select: { subjectId: true } });
      if (!c) throw Errors.notFound('Chapter');
      return c.subjectId;
    }
    return this.subjectOfTopic(id);
  }

  private model(db: Tx | PrismaService, level: Level) {
    // The three models share the fields used here (id, status, deletedAt, sortOrder).
    return (level === 'subject' ? db.subject : level === 'chapter' ? db.chapter : db.topic) as unknown as {
      update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
      findFirst(args: {
        where: Record<string, unknown>;
      }): Promise<{ id: string; status: PublishStatus } | null>;
    };
  }

  private async find(
    level: 'subject',
    id: string,
  ): Promise<{ id: string; status: PublishStatus; name: unknown }>;
  private async find(
    level: 'chapter',
    id: string,
  ): Promise<{ id: string; status: PublishStatus; subjectId: string; title: unknown }>;
  private async find(
    level: 'topic',
    id: string,
  ): Promise<{ id: string; status: PublishStatus; chapterId: string; title: unknown }>;
  private async find(level: Level, id: string): Promise<{ id: string; status: PublishStatus }>;
  private async find(level: Level, id: string) {
    const row = await this.model(this.prisma, level).findFirst({ where: { id, deletedAt: null } });
    if (!row) throw Errors.notFound(level[0]!.toUpperCase() + level.slice(1));
    return row;
  }

  private async findDeleted(level: Level, id: string) {
    const row = await this.model(this.prisma, level).findFirst({ where: { id, deletedAt: { not: null } } });
    if (!row) throw Errors.notFound(`Deleted ${level}`);
    return row;
  }

  private log(
    tx: Tx,
    actor: ContentActor,
    action: string,
    entityType: string,
    entityId: string,
    changes?: unknown,
  ) {
    return this.audit.record(
      {
        actorUserId: actor.userId,
        action,
        entityType,
        entityId,
        changes: changes as Prisma.InputJsonValue,
        client: actor.client,
      },
      tx,
    );
  }
}
