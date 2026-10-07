import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type AdminArticleQuery,
  type ArticleCategoryInput,
  type ArticleInput,
  type ArticleKind,
  type ArticleQuery,
  type ArticleStatusInput,
  type LocalizedText,
} from '@tk/contracts';
import { Errors } from '../../common/errors/app-error.js';
import { Prisma, type Article, type ArticleCategory } from '../../generated/prisma/client.js';
import { PrismaService, type Tx } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { mediaIdsIn } from '../content/practice-view.js';
import { assertCanSetStatus, assertSchedule, isLive, liveWhere } from '../content/publishing.js';
import { assertCanEditLive, type ContentActor } from '../content/scope.service.js';
import { MediaService } from '../media/media.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { plainLocalized, shorten } from '../notifications/plain-text.js';

type ArticleRow = Article & { category: ArticleCategory | null };

const dateOnly = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

/**
 * Articles (§12, D-018, D-063): current affairs digests, Gorkhapatra summaries, news and blog — written in the CMS
 * (`articles:edit`), published by `articles:publish` (D-036), free for everyone in the app and on the website. When
 * one with `notify` goes live, the worker tells every student once (their "Articles" choices apply).
 */
@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ───────────── Readers (app and website) ─────────────

  async list(query: ArticleQuery, now = new Date()) {
    const rows = await this.prisma.article.findMany({
      where: {
        ...liveWhere(now),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.period ? { period: query.period } : {}),
        ...(query.featured ? { isFeatured: query.featured === 'true' } : {}),
      },
      orderBy: [{ publishAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { category: true },
    });
    const page = rows.slice(0, query.limit);
    const covers = await this.media.publicImageUrls(
      page.map((a) => a.coverMediaId).filter((id): id is string => Boolean(id)),
    );
    return {
      data: page.map((a) => this.card(a, covers)),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async detail(slug: string, now = new Date()) {
    const a = await this.prisma.article.findFirst({
      where: { slug, ...liveWhere(now) },
      include: { category: true, quiz: true },
    });
    if (!a) throw Errors.notFound('Article');
    const media = await this.media.publicImageUrls([
      ...mediaIdsIn(a.body),
      ...(a.coverMediaId ? [a.coverMediaId] : []),
    ]);
    return {
      ...this.card(a, media),
      body: a.body,
      media,
      sourceUrl: a.sourceUrl,
      // Only a live quiz is offered; who may take it is checked when it is opened.
      quiz:
        a.quiz && isLive(a.quiz, now)
          ? { id: a.quiz.id, type: a.quiz.type, title: a.quiz.title as LocalizedText }
          : null,
      updatedAt: a.updatedAt.toISOString(),
    };
  }

  async categories(kind: ArticleKind | undefined) {
    const rows = await this.prisma.articleCategory.findMany({
      where: { active: true, ...(kind ? { kind } : {}) },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((c) => ({ id: c.id, kind: c.kind, name: c.name as LocalizedText }));
  }

  // ───────────── CMS ─────────────

  async adminList(query: AdminArticleQuery) {
    const rows = await this.prisma.article.findMany({
      where: {
        deletedAt: null,
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              OR: [
                { title: { path: ['en'], string_contains: query.q } },
                { title: { path: ['ne'], string_contains: query.q } },
                { slug: { contains: query.q.toLowerCase() } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { category: true },
    });
    const page = rows.slice(0, query.limit);
    return {
      data: page.map((a) => this.adminView(a)),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async adminDetail(id: string) {
    const a = await this.find(id);
    const media = await this.media.publicImageUrls([
      ...mediaIdsIn(a.body),
      ...(a.coverMediaId ? [a.coverMediaId] : []),
    ]);
    return {
      ...this.adminView(a),
      summary: (a.summary as LocalizedText | null) ?? null,
      body: a.body,
      media,
      coverMediaId: a.coverMediaId,
      quizAssessmentId: a.quizAssessmentId,
      sourceName: a.sourceName,
      sourceUrl: a.sourceUrl,
    };
  }

  async create(input: ArticleInput, actor: ContentActor) {
    await this.checkLinks(input);
    const article = await this.prisma.$transaction(async (tx) => {
      const row = await this.unique(() =>
        tx.article.create({
          data: { ...this.data(input), createdById: actor.userId, updatedById: actor.userId },
        }),
      );
      await this.log(tx, actor, 'article.create', row.id, { kind: input.kind, title: input.title });
      return row;
    });
    return { id: article.id };
  }

  /** T-026: a live article can be changed only by someone who may publish. */
  async update(id: string, input: ArticleInput, actor: ContentActor) {
    const before = await this.find(id);
    assertCanEditLive(actor, before.status, 'articles:publish');
    await this.checkLinks(input);
    await this.prisma.$transaction(async (tx) => {
      await this.unique(() =>
        tx.article.update({ where: { id }, data: { ...this.data(input), updatedById: actor.userId } }),
      );
      await this.log(tx, actor, 'article.update', id, {
        before: { title: before.title, slug: before.slug },
        after: { title: input.title, slug: input.slug },
      });
    });
    return this.adminDetail(id);
  }

  async setStatus(id: string, input: ArticleStatusInput, actor: ContentActor, now = new Date()) {
    const before = await this.find(id);
    assertCanSetStatus(actor.access, input.status, 'articles:publish');
    // A published article keeps the time it first went live (its date and place in the lists).
    const publishAt =
      input.status === 'scheduled'
        ? new Date(input.publishAt!)
        : input.status === 'published'
          ? before.publishAt && before.publishAt <= now
            ? before.publishAt
            : now
          : before.publishAt;
    assertSchedule(input.status, input.status === 'scheduled' ? publishAt : null, now);
    await this.prisma.$transaction(async (tx) => {
      await tx.article.update({
        where: { id },
        data: { status: input.status, publishAt, updatedById: actor.userId },
      });
      await this.log(tx, actor, 'article.status', id, { before: before.status, after: input.status });
    });
    return this.adminDetail(id);
  }

  /** Soft delete; archived first if it was live. */
  async remove(id: string, actor: ContentActor) {
    const before = await this.find(id);
    if (isLive(before)) assertCanSetStatus(actor.access, 'archived', 'articles:publish');
    await this.prisma.$transaction(async (tx) => {
      // The address becomes free again for a new article.
      await tx.article.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'archived', slug: `${before.slug}-deleted-${Date.now()}` },
      });
      await this.log(tx, actor, 'article.delete', id, { title: before.title, slug: before.slug });
    });
  }

  /** Live quizzes an article can link to (its writers need not manage assessments). */
  async quizOptions(now = new Date()) {
    const rows = await this.prisma.assessment.findMany({
      where: { ...liveWhere(now), type: 'quiz' },
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
      select: { id: true, title: true },
    });
    return rows.map((q) => ({ id: q.id, title: q.title as LocalizedText }));
  }

  async adminCategories() {
    const rows = await this.prisma.articleCategory.findMany({
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { articles: { where: { deletedAt: null } } } } },
    });
    return rows.map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.name as LocalizedText,
      sortOrder: c.sortOrder,
      active: c.active,
      articles: c._count.articles,
    }));
  }

  async saveCategory(id: string | null, input: ArticleCategoryInput, actor: ContentActor) {
    const data = {
      kind: input.kind,
      name: input.name as Prisma.InputJsonValue,
      sortOrder: input.sortOrder,
      active: input.active,
    };
    const row = await this.prisma.$transaction(async (tx) => {
      if (id) {
        const before = await tx.articleCategory.findUnique({ where: { id } });
        if (!before) throw Errors.notFound('Category');
        if (before.kind !== input.kind && (await tx.article.count({ where: { categoryId: id } })) > 0) {
          throw Errors.conflict(
            ErrorCode.CONFLICT,
            'Articles use this category; it cannot move to another kind',
          );
        }
      }
      const saved = id
        ? await tx.articleCategory.update({ where: { id }, data })
        : await tx.articleCategory.create({ data });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: id ? 'article_category.update' : 'article_category.create',
          entityType: 'article_category',
          entityId: saved.id,
          changes: { name: input.name, kind: input.kind, active: input.active },
          client: actor.client,
        },
        tx,
      );
      return saved;
    });
    return { id: row.id };
  }

  /** Worker: articles that went live with `notify` are announced to every active student, once. */
  async dispatchDue(now = new Date()): Promise<number> {
    const due = await this.prisma.article.findMany({
      where: { ...liveWhere(now), notify: true, notifiedAt: null },
      take: 5,
    });
    let dispatched = 0;
    for (const a of due) {
      const claimed = await this.prisma.article.updateMany({
        where: { id: a.id, notifiedAt: null },
        data: { notifiedAt: now },
      });
      if (claimed.count === 0) continue;
      await this.notifications.notifyAllStudents({
        category: 'article',
        title: a.title as LocalizedText,
        body: this.summary(a, 160),
        link: { type: 'article', slug: a.slug },
        sourceKey: `article:${a.id}`,
        inApp: true,
        push: true,
        email: true,
      });
      dispatched += 1;
    }
    return dispatched;
  }

  // ───────────── helpers ─────────────

  private card(a: ArticleRow, media: Record<string, { url: string; variants: Record<string, string> }>) {
    const cover = a.coverMediaId ? (media[a.coverMediaId] ?? null) : null;
    return {
      id: a.id,
      kind: a.kind,
      slug: a.slug,
      title: a.title as LocalizedText,
      summary: this.summary(a, 220),
      cover,
      category: a.category ? { id: a.category.id, name: a.category.name as LocalizedText } : null,
      period: a.period,
      periodDate: dateOnly(a.periodDate),
      sourceName: a.sourceName,
      isFeatured: a.isFeatured,
      publishedAt: (a.publishAt ?? a.createdAt).toISOString(),
    };
  }

  /** The written summary, or the start of the text. */
  private summary(a: Article, max: number): LocalizedText {
    if (a.summary) return a.summary as LocalizedText;
    const body = plainLocalized(a.body as Partial<Record<'en' | 'ne', unknown>>);
    return Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, shorten(v as string, max)]),
    ) as LocalizedText;
  }

  private adminView(a: ArticleRow) {
    return {
      id: a.id,
      kind: a.kind,
      slug: a.slug,
      title: a.title as LocalizedText,
      category: a.category ? { id: a.category.id, name: a.category.name as LocalizedText } : null,
      period: a.period,
      periodDate: dateOnly(a.periodDate),
      isFeatured: a.isFeatured,
      notify: a.notify,
      notifiedAt: a.notifiedAt?.toISOString() ?? null,
      status: a.status,
      publishAt: a.publishAt?.toISOString() ?? null,
      live: isLive(a),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    };
  }

  private data(input: ArticleInput) {
    return {
      kind: input.kind,
      slug: input.slug,
      title: input.title as Prisma.InputJsonValue,
      summary: (input.summary ?? Prisma.DbNull) as Prisma.InputJsonValue,
      body: input.body as Prisma.InputJsonValue,
      coverMediaId: input.coverMediaId,
      categoryId: input.categoryId,
      period: input.period,
      periodDate: input.periodDate ? new Date(`${input.periodDate}T00:00:00Z`) : null,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      quizAssessmentId: input.quizAssessmentId,
      isFeatured: input.isFeatured,
      notify: input.notify,
    };
  }

  /** The category must be of the same kind, the cover a public image, the quiz an existing assessment. */
  private async checkLinks(input: ArticleInput) {
    const problems: Array<{ path: string; message: string }> = [];
    if (input.categoryId) {
      const c = await this.prisma.articleCategory.findUnique({ where: { id: input.categoryId } });
      if (!c || c.kind !== input.kind)
        problems.push({ path: 'categoryId', message: 'Choose a category of this kind' });
    }
    if (input.coverMediaId) {
      const m = await this.prisma.mediaAsset.findFirst({
        where: { id: input.coverMediaId, kind: 'image', visibility: 'public', deletedAt: null },
      });
      if (!m) problems.push({ path: 'coverMediaId', message: 'Choose a public image' });
    }
    if (input.quizAssessmentId) {
      const q = await this.prisma.assessment.findFirst({
        where: { id: input.quizAssessmentId, deletedAt: null },
      });
      if (!q) problems.push({ path: 'quizAssessmentId', message: 'Choose an existing quiz' });
    }
    if (problems.length) throw Errors.validation(problems);
  }

  /** Two articles cannot share a web address. */
  private async unique<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw Errors.validation([{ path: 'slug', message: 'Another article already uses this web address' }]);
      }
      throw err;
    }
  }

  private async find(id: string): Promise<ArticleRow> {
    const a = await this.prisma.article.findFirst({
      where: { id, deletedAt: null },
      include: { category: true },
    });
    if (!a) throw Errors.notFound('Article');
    return a;
  }

  private log(tx: Tx, actor: ContentActor, action: string, entityId: string, changes: unknown) {
    return this.audit.record(
      {
        actorUserId: actor.userId,
        action,
        entityType: 'article',
        entityId,
        changes: changes as Prisma.InputJsonValue,
        client: actor.client,
      },
      tx,
    );
  }
}
