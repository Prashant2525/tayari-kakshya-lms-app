import { Injectable } from '@nestjs/common';
import {
  EXAM_NODE_RANK,
  ErrorCode,
  type ExamNodeInput,
  type LocalizedText,
  type PaperInput,
  type PublishStatus,
} from '@tk/contracts';
import type { ClientInfo } from '../../common/auth/auth-context.js';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { Prisma, type ExamNode, type Paper } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MediaService } from '../media/media.service.js';
import { publishedWhere } from './publishing.js';

export interface Actor {
  userId: string;
  client: ClientInfo;
}

const json = (v: unknown) => (v ?? Prisma.DbNull) as Prisma.InputJsonValue;
const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

/** Exam taxonomy (Authority → Level → Service → Group → Post, levels optional) and papers (D-007, D-010). */
@Injectable()
export class TaxonomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly storage: StorageService,
  ) {}

  // ───────────── Exam nodes ─────────────

  async adminTree(includeDeleted = false) {
    const nodes = await this.prisma.examNode.findMany({
      where: includeDeleted ? {} : { deletedAt: null },
      include: { icon: true, _count: { select: { courses: true, papers: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return nodes.map((n) => ({
      ...this.nodeView(n),
      status: n.status,
      deletedAt: n.deletedAt?.toISOString() ?? null,
      courseCount: n._count.courses,
      paperCount: n._count.papers,
    }));
  }

  /** Student-facing browse: published nodes under a parent (or roots), in order. */
  async publicNodes(parentId: string | null, nodeType?: ExamNode['nodeType']) {
    const nodes = await this.prisma.examNode.findMany({
      where: { ...publishedWhere, parentId, ...(nodeType ? { nodeType } : {}) },
      include: { icon: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    // Hide nodes whose ancestors are unpublished: only reachable through a published parent.
    if (parentId) {
      const parent = await this.prisma.examNode.findFirst({ where: { id: parentId, ...publishedWhere } });
      if (!parent) return [];
    }
    return nodes.map((n) => this.nodeView(n));
  }

  async createNode(input: ExamNodeInput, actor: Actor) {
    await this.validateNode(input, null);
    const node = await this.uniqueSlug(() =>
      this.prisma.$transaction(async (tx) => {
        const last = await tx.examNode.aggregate({
          where: { parentId: input.parentId, deletedAt: null },
          _max: { sortOrder: true },
        });
        const created = await tx.examNode.create({
          data: {
            parentId: input.parentId,
            nodeType: input.nodeType,
            name: input.name,
            slug: input.slug,
            description: json(input.description),
            iconMediaId: input.iconMediaId ?? null,
            sortOrder: (last._max.sortOrder ?? -1) + 1,
            createdById: actor.userId,
            updatedById: actor.userId,
          },
          include: { icon: true },
        });
        await this.audit.record(
          {
            actorUserId: actor.userId,
            action: 'exam_node.create',
            entityType: 'exam_node',
            entityId: created.id,
            changes: { after: input },
            client: actor.client,
          },
          tx,
        );
        return created;
      }),
    );
    return this.nodeView(node);
  }

  async updateNode(id: string, input: ExamNodeInput, actor: Actor) {
    const before = await this.prisma.examNode.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw Errors.notFound('Category');
    await this.validateNode(input, id);
    const node = await this.uniqueSlug(() =>
      this.prisma.$transaction(async (tx) => {
        const updated = await tx.examNode.update({
          where: { id },
          data: {
            parentId: input.parentId,
            nodeType: input.nodeType,
            name: input.name,
            slug: input.slug,
            description: json(input.description),
            iconMediaId: input.iconMediaId ?? null,
            updatedById: actor.userId,
          },
          include: { icon: true },
        });
        await this.audit.record(
          {
            actorUserId: actor.userId,
            action: 'exam_node.update',
            entityType: 'exam_node',
            entityId: id,
            changes: {
              before: {
                name: before.name,
                slug: before.slug,
                parentId: before.parentId,
                nodeType: before.nodeType,
              },
              after: input,
            },
            client: actor.client,
          },
          tx,
        );
        return updated;
      }),
    );
    return this.nodeView(node);
  }

  async setNodeStatus(id: string, status: PublishStatus, actor: Actor) {
    if (status === 'scheduled' || status === 'in_review') {
      throw Errors.validation([{ path: 'status', message: 'Categories are draft, published or archived' }]);
    }
    const node = await this.prisma.examNode.findFirst({ where: { id, deletedAt: null } });
    if (!node) throw Errors.notFound('Category');
    await this.prisma.$transaction(async (tx) => {
      await tx.examNode.update({ where: { id }, data: { status, updatedById: actor.userId } });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'exam_node.status',
          entityType: 'exam_node',
          entityId: id,
          changes: { before: node.status, after: status },
          client: actor.client,
        },
        tx,
      );
    });
  }

  async removeNode(id: string, actor: Actor) {
    const node = await this.prisma.examNode.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { courses: true } },
        children: { where: { deletedAt: null }, select: { id: true } },
      },
    });
    if (!node) throw Errors.notFound('Category');
    if (node.children.length > 0) {
      throw Errors.conflict(ErrorCode.CONFLICT, 'Move or delete the items inside this category first', {
        children: node.children.length,
      });
    }
    if (node._count.courses > 0) {
      throw Errors.conflict(ErrorCode.CONFLICT, 'Courses are linked to this post; unlink them first', {
        courses: node._count.courses,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.examNode.update({ where: { id }, data: { deletedAt: new Date(), updatedById: actor.userId } });
      await tx.postPaper.deleteMany({ where: { examNodeId: id } });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'exam_node.delete',
          entityType: 'exam_node',
          entityId: id,
          client: actor.client,
        },
        tx,
      );
    });
  }

  async restoreNode(id: string, actor: Actor) {
    const node = await this.prisma.examNode.findFirst({ where: { id, deletedAt: { not: null } } });
    if (!node) throw Errors.notFound('Deleted category');
    if (node.parentId) {
      const parent = await this.prisma.examNode.findFirst({ where: { id: node.parentId, deletedAt: null } });
      if (!parent) throw Errors.conflict(ErrorCode.CONFLICT, 'Restore its parent category first');
    }
    await this.uniqueSlug(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.examNode.update({
          where: { id },
          data: { deletedAt: null, status: 'draft', updatedById: actor.userId },
        });
        await this.audit.record(
          {
            actorUserId: actor.userId,
            action: 'exam_node.restore',
            entityType: 'exam_node',
            entityId: id,
            client: actor.client,
          },
          tx,
        );
      }),
    );
  }

  async reorderNodes(parentId: string | null, ids: string[], actor: Actor) {
    const siblings = await this.prisma.examNode.findMany({
      where: { parentId, deletedAt: null },
      select: { id: true },
    });
    const all = new Set(siblings.map((s) => s.id));
    if (ids.length !== all.size || new Set(ids).size !== ids.length || !ids.every((i) => all.has(i))) {
      throw Errors.validation([{ path: 'ids', message: 'Provide every item at this level exactly once' }]);
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of ids.entries())
        await tx.examNode.update({ where: { id }, data: { sortOrder: index } });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'exam_node.reorder',
          entityType: 'exam_node',
          entityId: parentId,
          changes: { order: ids },
          client: actor.client,
        },
        tx,
      );
    });
  }

  // ───────────── Papers ─────────────

  async listPapers(includeDeleted = false) {
    const papers = await this.prisma.paper.findMany({
      where: includeDeleted ? {} : { deletedAt: null },
      include: {
        posts: { include: { examNode: { select: { id: true, name: true } } }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return papers.map((p) => this.paperView(p));
  }

  async createPaper(input: PaperInput, actor: Actor) {
    await this.assertPosts(input.postIds);
    const paper = await this.prisma.$transaction(async (tx) => {
      const created = await tx.paper.create({
        data: {
          name: input.name,
          code: input.code ?? null,
          fullMarks: input.fullMarks ?? null,
          passMarks: input.passMarks ?? null,
          durationMinutes: input.durationMinutes ?? null,
          pattern: json(input.pattern),
          posts: { create: input.postIds.map((examNodeId, i) => ({ examNodeId, sortOrder: i })) },
        },
        include: { posts: { include: { examNode: { select: { id: true, name: true } } } } },
      });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'paper.create',
          entityType: 'paper',
          entityId: created.id,
          changes: { after: input },
          client: actor.client,
        },
        tx,
      );
      return created;
    });
    return this.paperView(paper);
  }

  async updatePaper(id: string, input: PaperInput, actor: Actor) {
    const before = await this.prisma.paper.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw Errors.notFound('Paper');
    await this.assertPosts(input.postIds);
    const paper = await this.prisma.$transaction(async (tx) => {
      await tx.postPaper.deleteMany({ where: { paperId: id } });
      const updated = await tx.paper.update({
        where: { id },
        data: {
          name: input.name,
          code: input.code ?? null,
          fullMarks: input.fullMarks ?? null,
          passMarks: input.passMarks ?? null,
          durationMinutes: input.durationMinutes ?? null,
          pattern: json(input.pattern),
          posts: { create: input.postIds.map((examNodeId, i) => ({ examNodeId, sortOrder: i })) },
        },
        include: { posts: { include: { examNode: { select: { id: true, name: true } } } } },
      });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'paper.update',
          entityType: 'paper',
          entityId: id,
          changes: { before: this.paperView({ ...before, posts: [] }), after: input },
          client: actor.client,
        },
        tx,
      );
      return updated;
    });
    return this.paperView(paper);
  }

  async setPaperStatus(id: string, status: PublishStatus, actor: Actor) {
    if (status === 'scheduled' || status === 'in_review') {
      throw Errors.validation([{ path: 'status', message: 'Papers are draft, published or archived' }]);
    }
    const paper = await this.prisma.paper.findFirst({ where: { id, deletedAt: null } });
    if (!paper) throw Errors.notFound('Paper');
    await this.prisma.$transaction(async (tx) => {
      await tx.paper.update({ where: { id }, data: { status } });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'paper.status',
          entityType: 'paper',
          entityId: id,
          changes: { before: paper.status, after: status },
          client: actor.client,
        },
        tx,
      );
    });
  }

  async removePaper(id: string, actor: Actor) {
    const paper = await this.prisma.paper.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { courseSubjects: true } } },
    });
    if (!paper) throw Errors.notFound('Paper');
    if (paper._count.courseSubjects > 0) {
      throw Errors.conflict(
        ErrorCode.CONFLICT,
        'Courses use this paper; remove it from those courses first',
        {
          courses: paper._count.courseSubjects,
        },
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.paper.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'paper.delete',
          entityType: 'paper',
          entityId: id,
          client: actor.client,
        },
        tx,
      );
    });
  }

  // ───────────── helpers ─────────────

  private async validateNode(input: ExamNodeInput, selfId: string | null): Promise<void> {
    if (input.nodeType === 'authority') {
      if (input.parentId)
        throw Errors.validation([{ path: 'parentId', message: 'Authorities are top-level categories' }]);
    } else {
      if (!input.parentId)
        throw Errors.validation([{ path: 'parentId', message: 'Choose where this belongs' }]);
      if (input.parentId === selfId)
        throw Errors.validation([{ path: 'parentId', message: 'An item cannot contain itself' }]);
      const parent = await this.prisma.examNode.findFirst({ where: { id: input.parentId, deletedAt: null } });
      if (!parent) throw Errors.validation([{ path: 'parentId', message: 'Parent category not found' }]);
      if (EXAM_NODE_RANK[input.nodeType] <= EXAM_NODE_RANK[parent.nodeType]) {
        throw Errors.validation([
          { path: 'nodeType', message: `A ${input.nodeType} cannot be placed under a ${parent.nodeType}` },
        ]);
      }
    }
    if (selfId) {
      const children = await this.prisma.examNode.findMany({
        where: { parentId: selfId, deletedAt: null },
        select: { nodeType: true },
      });
      if (children.some((c) => EXAM_NODE_RANK[c.nodeType] <= EXAM_NODE_RANK[input.nodeType])) {
        throw Errors.validation([
          { path: 'nodeType', message: 'Items inside this category would no longer fit under it' },
        ]);
      }
    }
    await this.media.assertPublicImages([input.iconMediaId]);
  }

  private async assertPosts(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const count = await this.prisma.examNode.count({
      where: { id: { in: ids }, nodeType: 'post', deletedAt: null },
    });
    if (count !== new Set(ids).size)
      throw Errors.validation([{ path: 'postIds', message: 'Papers can only be linked to posts' }]);
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

  private nodeView(n: ExamNode & { icon: { objectKey: string } | null }) {
    return {
      id: n.id,
      parentId: n.parentId,
      nodeType: n.nodeType,
      name: n.name as LocalizedText,
      slug: n.slug,
      description: (n.description as LocalizedText | null) ?? null,
      iconMediaId: n.iconMediaId,
      iconUrl: n.icon ? this.storage.publicUrl(n.icon.objectKey) : null,
      sortOrder: n.sortOrder,
    };
  }

  private paperView(p: Paper & { posts: Array<{ examNode: { id: string; name: unknown } }> }) {
    return {
      id: p.id,
      name: p.name as LocalizedText,
      code: p.code,
      fullMarks: num(p.fullMarks),
      passMarks: num(p.passMarks),
      durationMinutes: p.durationMinutes,
      pattern: (p.pattern as LocalizedText | null) ?? null,
      status: p.status,
      deletedAt: p.deletedAt?.toISOString() ?? null,
      posts: p.posts.map((pp) => ({ id: pp.examNode.id, name: pp.examNode.name as LocalizedText })),
    };
  }
}
