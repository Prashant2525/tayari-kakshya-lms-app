import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type ExamNodeInput,
  type ExamNodeTypeInput,
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

const typeName = (t: { key: string; name: unknown }) => (t.name as LocalizedText).en ?? t.key;
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

  // ───────────── Category types (admin-managed, DYNAMIC_ADMIN_AUDIT §4.1) ─────────────

  async listTypes(activeOnly: boolean) {
    const types = await this.prisma.examNodeType.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: [{ rank: 'asc' }, { key: 'asc' }],
      include: { _count: { select: { nodes: { where: { deletedAt: null } } } } },
    });
    return types.map((t) => ({
      key: t.key,
      name: t.name as LocalizedText,
      description: (t.description as LocalizedText | null) ?? null,
      rank: t.rank,
      topLevel: t.topLevel,
      canHavePapers: t.canHavePapers,
      active: t.active,
      nodeCount: t._count.nodes,
    }));
  }

  async createType(input: ExamNodeTypeInput, actor: Actor) {
    if (await this.prisma.examNodeType.findUnique({ where: { key: input.key } })) {
      throw new AppError(409, ErrorCode.CONFLICT, 'A category type with this key already exists', {
        field: 'key',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.examNodeType.create({ data: this.typeData(input) });
      await this.logType(tx, actor, 'exam_node_type.create', { after: input });
    });
    return (await this.listTypes(false)).find((t) => t.key === input.key);
  }

  /** The key is permanent; rank and flags may change only if existing categories still fit the new rules. */
  async updateType(key: string, input: ExamNodeTypeInput, actor: Actor) {
    const before = await this.prisma.examNodeType.findUnique({ where: { key } });
    if (!before) throw Errors.notFound('Category type');
    if (input.key !== key) {
      throw Errors.validation([{ path: 'key', message: 'The key of a category type cannot change' }]);
    }
    if (input.rank !== before.rank) {
      // A child must rank below its parent: check both directions for live categories of this type.
      const [underParent, overChild] = await Promise.all([
        this.prisma.examNode.count({
          where: {
            nodeType: key,
            deletedAt: null,
            parent: { deletedAt: null, type: { rank: { gte: input.rank } } },
          },
        }),
        this.prisma.examNode.count({
          where: {
            deletedAt: null,
            type: { rank: { lte: input.rank } },
            parent: { nodeType: key, deletedAt: null },
          },
        }),
      ]);
      if (underParent + overChild > 0) {
        throw Errors.conflict(
          ErrorCode.CONFLICT,
          'Existing categories would no longer fit this order. Move them first.',
          { conflicts: underParent + overChild },
        );
      }
    }
    if (input.topLevel !== before.topLevel) {
      const misplaced = await this.prisma.examNode.count({
        where: { nodeType: key, deletedAt: null, parentId: input.topLevel ? { not: null } : null },
      });
      if (misplaced > 0) {
        throw Errors.conflict(
          ErrorCode.CONFLICT,
          input.topLevel
            ? 'Some categories of this type sit inside another category'
            : 'Some categories of this type are top-level',
          { conflicts: misplaced },
        );
      }
    }
    if (before.canHavePapers && !input.canHavePapers) {
      const linked = await this.prisma.postPaper.count({ where: { examNode: { nodeType: key } } });
      if (linked > 0) {
        throw Errors.conflict(
          ErrorCode.CONFLICT,
          'Papers are linked to categories of this type. Unlink them first.',
          { conflicts: linked },
        );
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.examNodeType.update({ where: { key }, data: this.typeData(input) });
      await this.logType(tx, actor, 'exam_node_type.update', {
        key,
        before: { rank: before.rank, active: before.active, topLevel: before.topLevel },
        after: input,
      });
    });
    return (await this.listTypes(false)).find((t) => t.key === key);
  }

  async deleteType(key: string, actor: Actor) {
    const type = await this.prisma.examNodeType.findUnique({
      where: { key },
      include: { _count: { select: { nodes: true } } },
    });
    if (!type) throw Errors.notFound('Category type');
    if (type._count.nodes > 0) {
      throw Errors.conflict(ErrorCode.CONFLICT, 'Categories use this type. Turn it off instead.', {
        categories: type._count.nodes,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.examNodeType.delete({ where: { key } });
      await this.logType(tx, actor, 'exam_node_type.delete', { key });
    });
  }

  private typeData(input: ExamNodeTypeInput) {
    return {
      key: input.key,
      name: input.name,
      description: json(input.description),
      rank: input.rank,
      topLevel: input.topLevel,
      canHavePapers: input.canHavePapers,
      active: input.active,
    };
  }

  private logType(tx: Prisma.TransactionClient, actor: Actor, action: string, changes: object) {
    return this.audit.record(
      { actorUserId: actor.userId, action, entityType: 'exam_node_type', changes, client: actor.client },
      tx,
    );
  }

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
  async publicNodes(parentId: string | null, nodeType?: string) {
    const nodes = await this.prisma.examNode.findMany({
      where: { ...publishedWhere, parentId, ...(nodeType ? { nodeType } : {}) },
      include: { icon: true, _count: { select: { children: { where: publishedWhere } } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    // Hide nodes whose ancestors are unpublished: only reachable through a published parent.
    if (parentId) {
      const parent = await this.prisma.examNode.findFirst({ where: { id: parentId, ...publishedWhere } });
      if (!parent) return [];
    }
    // childCount lets apps drill down level by level without knowing the category types.
    return nodes.map((n) => ({ ...this.nodeView(n), childCount: n._count.children }));
  }

  // ───────────── Student target posts (onboarding, S1) ─────────────

  /** The student's chosen categories that are still reachable (published, with published ancestors). */
  async targetPosts(userId: string) {
    const rows = await this.prisma.userTargetPost.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { examNodeId: true },
    });
    const views = await Promise.all(rows.map((r) => this.publishedPath(r.examNodeId)));
    return views.filter((v): v is NonNullable<typeof v> => v !== null);
  }

  /** Replaces the student's target posts. Every id must be a reachable published category. */
  async setTargetPosts(userId: string, examNodeIds: string[]) {
    const paths = await Promise.all(examNodeIds.map((id) => this.publishedPath(id)));
    const unknown = examNodeIds.filter((_, i) => paths[i] === null);
    if (unknown.length > 0) {
      throw Errors.validation(
        unknown.map((id) => ({ path: 'examNodeIds', message: `Category ${id} is not available` })),
      );
    }
    await this.prisma.$transaction([
      this.prisma.userTargetPost.deleteMany({ where: { userId } }),
      this.prisma.userTargetPost.createMany({
        data: examNodeIds.map((examNodeId, sortOrder) => ({ userId, examNodeId, sortOrder })),
      }),
    ]);
    return this.targetPosts(userId);
  }

  /** A published node with the names of its ancestors (root first), or null if it or an ancestor is not live. */
  private async publishedPath(id: string) {
    const path: Array<{ id: string; nodeType: string; name: LocalizedText }> = [];
    let node = await this.prisma.examNode.findFirst({
      where: { id, ...publishedWhere },
      include: { icon: true },
    });
    const leaf = node;
    // Bounded walk: category trees are a handful of levels deep.
    for (let depth = 0; node && depth < 20; depth++) {
      path.unshift({ id: node.id, nodeType: node.nodeType, name: node.name as LocalizedText });
      if (!node.parentId) break;
      const parentId: string = node.parentId;
      node = await this.prisma.examNode.findFirst({
        where: { id: parentId, ...publishedWhere },
        include: { icon: true },
      });
    }
    if (!leaf || !node || node.parentId !== null) return null;
    return { ...this.nodeView(leaf), path: path.slice(0, -1) };
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

  private async typeOf(key: string, path = 'nodeType') {
    const type = await this.prisma.examNodeType.findUnique({ where: { key } });
    if (!type) throw Errors.validation([{ path, message: 'Unknown category type' }]);
    return type;
  }

  /** Hierarchy rules come from the admin-managed category types (rank, top level). */
  private async validateNode(input: ExamNodeInput, selfId: string | null): Promise<void> {
    const type = await this.typeOf(input.nodeType);
    const before = selfId ? await this.prisma.examNode.findUnique({ where: { id: selfId } }) : null;
    if (!type.active && before?.nodeType !== input.nodeType) {
      throw Errors.validation([{ path: 'nodeType', message: 'This category type is turned off' }]);
    }
    const name = typeName(type);
    if (type.topLevel) {
      if (input.parentId) {
        throw Errors.validation([{ path: 'parentId', message: `${name} is a top-level category` }]);
      }
    } else {
      if (!input.parentId)
        throw Errors.validation([{ path: 'parentId', message: 'Choose where this belongs' }]);
      if (input.parentId === selfId) {
        throw Errors.validation([{ path: 'parentId', message: 'An item cannot contain itself' }]);
      }
      const parent = await this.prisma.examNode.findFirst({
        where: { id: input.parentId, deletedAt: null },
        include: { type: true },
      });
      if (!parent) throw Errors.validation([{ path: 'parentId', message: 'Parent category not found' }]);
      if (type.rank <= parent.type.rank) {
        throw Errors.validation([
          { path: 'nodeType', message: `A ${name} cannot be placed under a ${typeName(parent.type)}` },
        ]);
      }
    }
    if (selfId) {
      const children = await this.prisma.examNode.findMany({
        where: { parentId: selfId, deletedAt: null },
        include: { type: true },
      });
      if (children.some((c) => c.type.rank <= type.rank)) {
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
      where: { id: { in: ids }, deletedAt: null, type: { canHavePapers: true } },
    });
    if (count !== new Set(ids).size) {
      throw Errors.validation([
        { path: 'postIds', message: 'Papers can only be linked to categories whose type allows papers' },
      ]);
    }
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
