import { Injectable } from '@nestjs/common';
import {
  richDocMediaIds,
  richDocText,
  type LocalizedRichDoc,
  type LocalizedText,
  type PublishStatus,
  type QuestionContent,
  type QuestionGroupInput,
  type QuestionInput,
  type QuestionListQuery,
} from '@tk/contracts';
import { Errors } from '../../common/errors/app-error.js';
import { Prisma, type Question } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { assertCanSetStatus } from '../content/publishing.js';
import { assertCanEditLive, ScopeService, type ContentActor } from '../content/scope.service.js';
import { MediaService } from '../media/media.service.js';

/** Stable JSON (sorted keys) so stored jsonb and incoming content compare equal when nothing changed. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Every localized rich document inside a question (stem, choices, model answer, explanation). */
function contentDocs(content: QuestionContent): LocalizedRichDoc[] {
  const docs: Array<LocalizedRichDoc | null | undefined> = [content.stem, content.explanation];
  if (content.type === 'single_choice' || content.type === 'multiple_choice')
    docs.push(...content.options.map((o) => o.content));
  if (content.type === 'match')
    docs.push(...content.left.map((o) => o.content), ...content.right.map((o) => o.content));
  if (content.type === 'subjective') docs.push(content.modelAnswer);
  return docs.filter((d): d is LocalizedRichDoc => Boolean(d));
}

function mediaIds(docs: LocalizedRichDoc[]): string[] {
  return docs.flatMap((d) => [...richDocMediaIds(d.en), ...richDocMediaIds(d.ne)]);
}

function searchTextOf(content: QuestionContent): string {
  const docs = [content.stem];
  if (content.type === 'single_choice' || content.type === 'multiple_choice')
    docs.push(...content.options.map((o) => o.content));
  return docs
    .flatMap((d) => [d.en ? richDocText(d.en) : '', d.ne ? richDocText(d.ne) : ''])
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

const STRUCTURAL: ReadonlySet<PublishStatus> = new Set(['draft', 'in_review', 'published', 'archived']);

/** Question bank (D-016, D-020): metadata on `questions`, content in immutable `question_versions`. */
@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly media: MediaService,
  ) {}

  async list(query: QuestionListQuery, actor: ContentActor) {
    const allowed = await this.scope.allowedSubjectIds(actor);
    const where: Prisma.QuestionWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      // Scoped staff only see their subjects; a subject filter narrows within that.
      AND: [
        ...(allowed ? [{ subjectId: { in: [...allowed] } }] : []),
        ...(query.subjectId ? [{ subjectId: query.subjectId }] : []),
      ],
      ...(query.topicId ? { topicId: query.topicId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.pyq !== undefined ? { isPyq: query.pyq } : {}),
      ...(query.tag ? { tags: { some: { tag: { name: query.tag } } } } : {}),
      ...(query.q ? { searchText: { contains: query.q, mode: 'insensitive' } } : {}),
      ...(query.cursor ? { id: { lt: query.cursor } } : {}),
    };
    const rows = await this.prisma.question.findMany({
      where,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      include: {
        subject: { select: { name: true } },
        topic: { select: { title: true } },
        tags: { include: { tag: true } },
        _count: { select: { reports: { where: { status: 'open' } } } },
      },
    });
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((q) => ({
        id: q.id,
        type: q.type,
        difficulty: q.difficulty,
        status: q.status,
        accessLevel: q.accessLevel,
        isPyq: q.isPyq,
        preview: q.searchText.slice(0, 200),
        subject: q.subject.name as LocalizedText,
        topic: (q.topic?.title as LocalizedText | undefined) ?? null,
        tags: q.tags.map((t) => t.tag.name).sort(),
        defaultMarks: Number(q.defaultMarks),
        openReports: q._count.reports,
        deletedAt: q.deletedAt?.toISOString() ?? null,
        updatedAt: q.updatedAt.toISOString(),
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async get(id: string, actor: ContentActor) {
    const q = await this.findLive(id);
    await this.scope.assertSubject(actor, q.subjectId);
    return this.detail(id);
  }

  async create(input: QuestionInput, actor: ContentActor) {
    await this.validate(input, actor);
    const id = await this.prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          ...this.metadata(input),
          type: input.content.type,
          searchText: searchTextOf(input.content),
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      const version = await tx.questionVersion.create({
        data: {
          questionId: question.id,
          versionNo: 1,
          content: input.content as Prisma.InputJsonValue,
          createdById: actor.userId,
        },
      });
      await tx.question.update({ where: { id: question.id }, data: { currentVersionId: version.id } });
      await this.replaceTagsAndSources(tx, question.id, input);
      await this.log(tx, actor, 'question.create', question.id, {
        after: { type: input.content.type, subjectId: input.subjectId, difficulty: input.difficulty },
      });
      return question.id;
    });
    return this.detail(id);
  }

  async update(id: string, input: QuestionInput, actor: ContentActor) {
    const before = await this.findLive(id);
    await this.scope.assertSubject(actor, before.subjectId);
    assertCanEditLive(actor, before.status, 'questions:publish');
    if (before.type !== input.content.type) {
      throw Errors.validation([
        {
          path: 'content.type',
          message: 'The type of a question cannot change; create a new question instead',
        },
      ]);
    }
    await this.validate(input, actor);
    await this.prisma.$transaction(async (tx) => {
      const current = before.currentVersionId
        ? await tx.questionVersion.findUnique({ where: { id: before.currentVersionId } })
        : null;
      let versionNo = current?.versionNo ?? 0;
      const changed = !current || canonicalJson(current.content) !== canonicalJson(input.content);
      let currentVersionId = before.currentVersionId;
      if (changed) {
        // Lock the question row so concurrent edits cannot both claim the next version number.
        await tx.$executeRaw`SELECT 1 FROM questions WHERE id = ${id}::uuid FOR UPDATE`;
        const last = await tx.questionVersion.aggregate({
          where: { questionId: id },
          _max: { versionNo: true },
        });
        versionNo = (last._max.versionNo ?? 0) + 1;
        const version = await tx.questionVersion.create({
          data: {
            questionId: id,
            versionNo,
            content: input.content as Prisma.InputJsonValue,
            createdById: actor.userId,
          },
        });
        currentVersionId = version.id;
      }
      await tx.question.update({
        where: { id },
        data: {
          ...this.metadata(input),
          searchText: searchTextOf(input.content),
          currentVersionId,
          updatedById: actor.userId,
        },
      });
      await this.replaceTagsAndSources(tx, id, input);
      await this.log(tx, actor, 'question.update', id, {
        newVersion: changed ? versionNo : null,
        after: { difficulty: input.difficulty, defaultMarks: input.defaultMarks, tags: input.tags },
      });
    });
    return this.detail(id);
  }

  async versions(id: string, actor: ContentActor) {
    const q = await this.findLive(id);
    await this.scope.assertSubject(actor, q.subjectId);
    const rows = await this.prisma.questionVersion.findMany({
      where: { questionId: id },
      orderBy: { versionNo: 'desc' },
    });
    return rows.map((v) => ({
      id: v.id,
      versionNo: v.versionNo,
      current: v.id === q.currentVersionId,
      content: v.content as QuestionContent,
      createdAt: v.createdAt.toISOString(),
    }));
  }

  async setStatus(id: string, status: PublishStatus, actor: ContentActor) {
    if (!STRUCTURAL.has(status)) {
      throw Errors.validation([
        { path: 'status', message: 'Questions are draft, in review, published or archived' },
      ]);
    }
    assertCanSetStatus(actor.access, status, 'questions:publish');
    const q = await this.findLive(id);
    await this.scope.assertSubject(actor, q.subjectId);
    await this.prisma.$transaction(async (tx) => {
      await tx.question.update({ where: { id }, data: { status, updatedById: actor.userId } });
      await this.log(tx, actor, 'question.status', id, { before: q.status, after: status });
    });
  }

  async remove(id: string, actor: ContentActor) {
    assertCanSetStatus(actor.access, 'archived', 'questions:publish');
    const q = await this.findLive(id);
    await this.scope.assertSubject(actor, q.subjectId);
    await this.prisma.$transaction(async (tx) => {
      await tx.question.update({ where: { id }, data: { deletedAt: new Date(), updatedById: actor.userId } });
      await this.log(tx, actor, 'question.delete', id, {});
    });
  }

  async restore(id: string, actor: ContentActor) {
    assertCanSetStatus(actor.access, 'archived', 'questions:publish');
    const q = await this.prisma.question.findFirst({ where: { id, deletedAt: { not: null } } });
    if (!q) throw Errors.notFound('Deleted question');
    await this.scope.assertSubject(actor, q.subjectId);
    await this.prisma.$transaction(async (tx) => {
      await tx.question.update({ where: { id }, data: { deletedAt: null, updatedById: actor.userId } });
      await this.log(tx, actor, 'question.restore', id, {});
    });
  }

  async tags(q: string | undefined) {
    const rows = await this.prisma.tag.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      orderBy: { name: 'asc' },
      take: 30,
      include: { _count: { select: { questions: true } } },
    });
    return rows.map((t) => ({ name: t.name, questionCount: t._count.questions }));
  }

  // ───────────── Passages ─────────────

  async listGroups(q: string | undefined) {
    const rows = await this.prisma.questionGroup.findMany({
      where: {
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { title: { path: ['en'], string_contains: q, mode: 'insensitive' } },
                { title: { path: ['ne'], string_contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { id: 'desc' },
      take: 50,
      include: { _count: { select: { questions: { where: { deletedAt: null } } } } },
    });
    return rows.map((g) => ({
      id: g.id,
      title: (g.title as LocalizedText | null) ?? null,
      passage: g.passage as LocalizedRichDoc,
      questionCount: g._count.questions,
      updatedAt: g.updatedAt.toISOString(),
    }));
  }

  async saveGroup(id: string | null, input: QuestionGroupInput, actor: ContentActor) {
    await this.media.assertPublicImages(mediaIds([input.passage]));
    const data = {
      title: (input.title ?? Prisma.DbNull) as Prisma.InputJsonValue,
      passage: input.passage as Prisma.InputJsonValue,
      updatedById: actor.userId,
    };
    return this.prisma.$transaction(async (tx) => {
      const group = id
        ? await tx.questionGroup.update({ where: { id }, data })
        : await tx.questionGroup.create({ data: { ...data, createdById: actor.userId } });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: id ? 'question_group.update' : 'question_group.create',
          entityType: 'question_group',
          entityId: group.id,
          client: actor.client,
        },
        tx,
      );
      return { id: group.id };
    });
  }

  // ───────────── helpers ─────────────

  private metadata(input: QuestionInput) {
    return {
      subjectId: input.subjectId,
      topicId: input.topicId ?? null,
      groupId: input.groupId ?? null,
      difficulty: input.difficulty,
      defaultMarks: input.defaultMarks,
      defaultNegativeMarks: input.defaultNegativeMarks,
      language: input.language,
      accessLevel: input.accessLevel,
      isPyq: input.sources.length > 0,
    };
  }

  private async validate(input: QuestionInput, actor: ContentActor) {
    await this.scope.assertSubject(actor, input.subjectId);
    const subject = await this.prisma.subject.findFirst({ where: { id: input.subjectId, deletedAt: null } });
    if (!subject) throw Errors.validation([{ path: 'subjectId', message: 'Subject not found' }]);
    if (input.topicId) {
      const topic = await this.prisma.topic.findFirst({
        where: { id: input.topicId, deletedAt: null, chapter: { subjectId: input.subjectId } },
      });
      if (!topic)
        throw Errors.validation([{ path: 'topicId', message: 'Choose a topic from the same subject' }]);
    }
    if (input.groupId) {
      const group = await this.prisma.questionGroup.findFirst({
        where: { id: input.groupId, deletedAt: null },
      });
      if (!group) throw Errors.validation([{ path: 'groupId', message: 'Passage not found' }]);
    }
    if (input.defaultNegativeMarks > input.defaultMarks) {
      throw Errors.validation([
        { path: 'defaultNegativeMarks', message: 'Negative marks cannot be more than the marks' },
      ]);
    }
    for (const [i, s] of input.sources.entries()) {
      if (
        s.examNodeId &&
        !(await this.prisma.examNode.findFirst({ where: { id: s.examNodeId, deletedAt: null } }))
      ) {
        throw Errors.validation([{ path: `sources.${i}.examNodeId`, message: 'Exam category not found' }]);
      }
      if (s.paperId && !(await this.prisma.paper.findFirst({ where: { id: s.paperId, deletedAt: null } }))) {
        throw Errors.validation([{ path: `sources.${i}.paperId`, message: 'Paper not found' }]);
      }
    }
    await this.media.assertPublicImages(mediaIds(contentDocs(input.content)));
  }

  private async replaceTagsAndSources(
    tx: Prisma.TransactionClient,
    questionId: string,
    input: QuestionInput,
  ) {
    await tx.questionTag.deleteMany({ where: { questionId } });
    // Case-insensitive de-duplication; the first spelling wins (tags are citext, so "Rights" = "rights").
    const names: string[] = [];
    for (const tag of input.tags) {
      if (!names.some((n) => n.toLowerCase() === tag.toLowerCase())) names.push(tag);
    }
    if (names.length) {
      await tx.tag.createMany({ data: names.map((name) => ({ name })), skipDuplicates: true });
      const tags = await tx.tag.findMany({ where: { name: { in: names } } });
      await tx.questionTag.createMany({
        data: tags.map((t) => ({ questionId, tagId: t.id })),
        skipDuplicates: true,
      });
    }
    await tx.questionSource.deleteMany({ where: { questionId } });
    if (input.sources.length) {
      await tx.questionSource.createMany({
        data: input.sources.map((s) => ({
          questionId,
          examNodeId: s.examNodeId ?? null,
          paperId: s.paperId ?? null,
          yearBs: s.yearBs ?? null,
          note: s.note ?? null,
        })),
      });
    }
  }

  private async detail(id: string) {
    const q = await this.prisma.question.findUniqueOrThrow({
      where: { id },
      include: {
        currentVersion: true,
        subject: { select: { id: true, name: true } },
        topic: { select: { id: true, title: true } },
        group: { select: { id: true, title: true } },
        tags: { include: { tag: true } },
        sources: { include: { examNode: { select: { name: true } }, paper: { select: { name: true } } } },
        _count: { select: { versions: true, reports: { where: { status: 'open' } } } },
      },
    });
    return {
      id: q.id,
      type: q.type,
      subject: { id: q.subject.id, name: q.subject.name as LocalizedText },
      topic: q.topic ? { id: q.topic.id, title: q.topic.title as LocalizedText } : null,
      group: q.group ? { id: q.group.id, title: (q.group.title as LocalizedText | null) ?? null } : null,
      difficulty: q.difficulty,
      defaultMarks: Number(q.defaultMarks),
      defaultNegativeMarks: Number(q.defaultNegativeMarks),
      language: q.language,
      accessLevel: q.accessLevel,
      isPyq: q.isPyq,
      status: q.status,
      tags: q.tags.map((t) => t.tag.name).sort(),
      sources: q.sources.map((s) => ({
        examNodeId: s.examNodeId,
        examNodeName: (s.examNode?.name as LocalizedText | undefined) ?? null,
        paperId: s.paperId,
        paperName: (s.paper?.name as LocalizedText | undefined) ?? null,
        yearBs: s.yearBs,
        note: s.note,
      })),
      content: (q.currentVersion?.content as QuestionContent | undefined) ?? null,
      versionNo: q.currentVersion?.versionNo ?? 0,
      versionCount: q._count.versions,
      openReports: q._count.reports,
      updatedAt: q.updatedAt.toISOString(),
    };
  }

  private async findLive(id: string): Promise<Question> {
    const q = await this.prisma.question.findFirst({ where: { id, deletedAt: null } });
    if (!q) throw Errors.notFound('Question');
    return q;
  }

  private log(
    tx: Prisma.TransactionClient,
    actor: ContentActor,
    action: string,
    id: string,
    changes: object,
  ) {
    return this.audit.record(
      {
        actorUserId: actor.userId,
        action,
        entityType: 'question',
        entityId: id,
        changes,
        client: actor.client,
      },
      tx,
    );
  }
}
