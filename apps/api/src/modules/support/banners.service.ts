import { Injectable } from '@nestjs/common';
import type { BannerInput, BannerQuery, LocalizedText } from '@tk/contracts';
import { Errors } from '../../common/errors/app-error.js';
import { Prisma, type Banner, type Platform } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { ContentActor } from '../content/scope.service.js';
import { MediaService } from '../media/media.service.js';

/** Links that lead to buying or to the website are never shown in the iPhone app (D-027, D-061). */
const IOS_BLOCKED_LINKS = ['plan', 'url'] as const;

/**
 * Promotional banners (D-064): a picture with a title and an optional link, scheduled, for the app's Home, the
 * website's home page or both. On iPhone, banners that lead to buying are left out.
 */
@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  async live(query: BannerQuery, platform: Platform, now = new Date()) {
    const rows = await this.prisma.banner.findMany({
      where: {
        active: true,
        placement: { in: [query.placement, 'both'] },
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
        ...(platform === 'ios' ? { hideOnIos: false, linkType: { notIn: [...IOS_BLOCKED_LINKS] } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: 10,
    });
    const images = await this.media.publicImageUrls(rows.map((b) => b.imageMediaId));
    return rows
      .filter((b) => images[b.imageMediaId])
      .map((b) => ({
        id: b.id,
        title: b.title as LocalizedText,
        image: images[b.imageMediaId]!,
        link: b.linkType === 'none' ? null : { type: b.linkType, value: b.linkValue },
      }));
  }

  async adminList() {
    const rows = await this.prisma.banner.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    const images = await this.media.publicImageUrls(rows.map((b) => b.imageMediaId));
    return rows.map((b) => ({ ...this.view(b), image: images[b.imageMediaId] ?? null }));
  }

  async save(id: string | null, input: BannerInput, actor: ContentActor) {
    await this.check(input);
    const data = {
      title: input.title as Prisma.InputJsonValue,
      imageMediaId: input.imageMediaId,
      linkType: input.linkType,
      linkValue: input.linkType === 'none' ? '' : input.linkValue,
      placement: input.placement,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      sortOrder: input.sortOrder,
      active: input.active,
      hideOnIos: input.hideOnIos,
    };
    const row = await this.prisma.$transaction(async (tx) => {
      if (id && !(await tx.banner.findUnique({ where: { id } }))) throw Errors.notFound('Banner');
      const saved = id ? await tx.banner.update({ where: { id }, data }) : await tx.banner.create({ data });
      await this.log(tx, actor, id ? 'banner.update' : 'banner.create', saved.id, {
        title: input.title,
        link: `${input.linkType}:${input.linkValue}`,
      });
      return saved;
    });
    return { id: row.id };
  }

  async remove(id: string, actor: ContentActor) {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.banner.findUnique({ where: { id } });
      if (!before) throw Errors.notFound('Banner');
      await tx.banner.delete({ where: { id } });
      await this.log(tx, actor, 'banner.delete', id, { title: before.title });
    });
  }

  /** The picture must be public; a course, plan or article link must point at one that exists. */
  private async check(input: BannerInput) {
    const problems: Array<{ path: string; message: string }> = [];
    const image = await this.prisma.mediaAsset.findFirst({
      where: { id: input.imageMediaId, kind: 'image', visibility: 'public', deletedAt: null },
    });
    if (!image) problems.push({ path: 'imageMediaId', message: 'Choose a public image' });
    const where = { slug: input.linkValue, deletedAt: null };
    const exists =
      input.linkType === 'course'
        ? await this.prisma.course.count({ where })
        : input.linkType === 'plan'
          ? await this.prisma.plan.count({ where })
          : input.linkType === 'article'
            ? await this.prisma.article.count({ where })
            : 1;
    if (!exists) problems.push({ path: 'linkValue', message: `No ${input.linkType} has this web address` });
    if (problems.length) throw Errors.validation(problems);
  }

  private view(b: Banner) {
    return {
      id: b.id,
      title: b.title as LocalizedText,
      imageMediaId: b.imageMediaId,
      linkType: b.linkType,
      linkValue: b.linkValue,
      placement: b.placement,
      startsAt: b.startsAt?.toISOString() ?? null,
      endsAt: b.endsAt?.toISOString() ?? null,
      sortOrder: b.sortOrder,
      active: b.active,
      hideOnIos: b.hideOnIos,
    };
  }

  private log(
    tx: Prisma.TransactionClient,
    actor: ContentActor,
    action: string,
    entityId: string,
    changes: unknown,
  ) {
    return this.audit.record(
      {
        actorUserId: actor.userId,
        action,
        entityType: 'banner',
        entityId,
        changes: changes as Prisma.InputJsonValue,
        client: actor.client,
      },
      tx,
    );
  }
}
