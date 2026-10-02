import { Injectable } from '@nestjs/common';
import {
  richDocMediaIds,
  type LearningItemInput,
  type LocalizedRichDoc,
  type LocalizedText,
  type StatusChangeInput,
} from '@tk/contracts';
import { Errors } from '../../common/errors/app-error.js';
import {
  Prisma,
  type LearningItem,
  type MediaAsset,
  type VideoAsset,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MediaService } from '../media/media.service.js';
import { ContentService } from './content.service.js';
import { assertCanSetStatus, assertSchedule } from './publishing.js';
import { assertCanEditLive, ScopeService, type ContentActor } from './scope.service.js';
import { VideoService } from './video.service.js';

type ItemWithRelations = LearningItem & { pdf: MediaAsset | null; video: VideoAsset | null };

/** Notes (rich text), PDFs and videos attached to topics. */
@Injectable()
export class LearningItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly content: ContentService,
    private readonly media: MediaService,
    private readonly video: VideoService,
  ) {}

  async get(id: string, actor: ContentActor) {
    const item = await this.findLive(id);
    await this.scope.assertSubject(actor, await this.content.subjectOfTopic(item.topicId));
    return this.adminView(item);
  }

  async create(topicId: string, input: LearningItemInput, actor: ContentActor) {
    const topic = await this.prisma.topic.findFirst({ where: { id: topicId, deletedAt: null } });
    if (!topic) throw Errors.notFound('Topic');
    await this.scope.assertSubject(actor, await this.content.subjectOfTopic(topicId));
    const payload = await this.payload(input, actor);
    const item = await this.prisma.$transaction(async (tx) => {
      const last = await tx.learningItem.aggregate({
        where: { topicId, deletedAt: null },
        _max: { sortOrder: true },
      });
      const created = await tx.learningItem.create({
        data: {
          topicId,
          type: input.type,
          title: input.title,
          accessLevel: input.accessLevel,
          language: input.language,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
          createdById: actor.userId,
          updatedById: actor.userId,
          ...payload,
        },
        include: { pdf: true, video: true },
      });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'learning_item.create',
          entityType: 'learning_item',
          entityId: created.id,
          changes: { after: { type: input.type, title: input.title, accessLevel: input.accessLevel } },
          client: actor.client,
        },
        tx,
      );
      return created;
    });
    return this.adminView(item);
  }

  async update(id: string, input: LearningItemInput, actor: ContentActor) {
    const before = await this.findLive(id);
    await this.scope.assertSubject(actor, await this.content.subjectOfTopic(before.topicId));
    assertCanEditLive(actor, before.status, 'content:publish');
    if (before.type !== input.type) {
      throw Errors.validation([
        { path: 'type', message: 'The type of an item cannot change; create a new item instead' },
      ]);
    }
    const payload = await this.payload(input, actor);
    const item = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.learningItem.update({
        where: { id },
        data: {
          title: input.title,
          accessLevel: input.accessLevel,
          language: input.language,
          updatedById: actor.userId,
          ...payload,
        },
        include: { pdf: true, video: true },
      });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'learning_item.update',
          entityType: 'learning_item',
          entityId: id,
          changes: {
            before: { title: before.title as Prisma.InputJsonValue, accessLevel: before.accessLevel },
            after: { title: input.title, accessLevel: input.accessLevel },
          },
          client: actor.client,
        },
        tx,
      );
      return updated;
    });
    return this.adminView(item);
  }

  async setStatus(id: string, change: StatusChangeInput, actor: ContentActor) {
    assertCanSetStatus(actor.access, change.status, 'content:publish');
    const item = await this.findLive(id);
    await this.scope.assertSubject(actor, await this.content.subjectOfTopic(item.topicId));
    const publishAt = change.status === 'scheduled' && change.publishAt ? new Date(change.publishAt) : null;
    assertSchedule(change.status, publishAt);
    await this.prisma.$transaction(async (tx) => {
      await tx.learningItem.update({
        where: { id },
        data: {
          status: change.status,
          publishAt: change.status === 'published' ? new Date() : publishAt,
          updatedById: actor.userId,
        },
      });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'learning_item.status',
          entityType: 'learning_item',
          entityId: id,
          changes: { before: item.status, after: change.status, publishAt: publishAt?.toISOString() ?? null },
          client: actor.client,
        },
        tx,
      );
    });
  }

  async remove(id: string, actor: ContentActor) {
    assertCanSetStatus(actor.access, 'archived', 'content:publish');
    const item = await this.findLive(id);
    await this.scope.assertSubject(actor, await this.content.subjectOfTopic(item.topicId));
    await this.prisma.$transaction(async (tx) => {
      await tx.learningItem.update({
        where: { id },
        data: { deletedAt: new Date(), updatedById: actor.userId },
      });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'learning_item.delete',
          entityType: 'learning_item',
          entityId: id,
          client: actor.client,
        },
        tx,
      );
    });
  }

  async restore(id: string, actor: ContentActor) {
    assertCanSetStatus(actor.access, 'archived', 'content:publish');
    const item = await this.prisma.learningItem.findFirst({ where: { id, deletedAt: { not: null } } });
    if (!item) throw Errors.notFound('Deleted item');
    await this.scope.assertSubject(actor, await this.content.subjectOfTopic(item.topicId));
    await this.prisma.$transaction(async (tx) => {
      await tx.learningItem.update({
        where: { id },
        data: { deletedAt: null, status: 'draft', publishAt: null },
      });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'learning_item.restore',
          entityType: 'learning_item',
          entityId: id,
          client: actor.client,
        },
        tx,
      );
    });
  }

  async reorder(topicId: string, ids: string[], actor: ContentActor) {
    await this.scope.assertSubject(actor, await this.content.subjectOfTopic(topicId));
    const siblings = await this.prisma.learningItem.findMany({
      where: { topicId, deletedAt: null },
      select: { id: true },
    });
    const all = new Set(siblings.map((s) => s.id));
    if (ids.length !== all.size || new Set(ids).size !== ids.length || !ids.every((i) => all.has(i))) {
      throw Errors.validation([{ path: 'ids', message: 'Provide every item in this topic exactly once' }]);
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of ids.entries())
        await tx.learningItem.update({ where: { id }, data: { sortOrder: index } });
      await this.audit.record(
        {
          actorUserId: actor.userId,
          action: 'learning_item.reorder',
          entityType: 'topic',
          entityId: topicId,
          changes: { order: ids },
          client: actor.client,
        },
        tx,
      );
    });
  }

  // ───────────── helpers ─────────────

  private async payload(input: LearningItemInput, actor: ContentActor) {
    if (input.type === 'note') {
      const ids = [...richDocMediaIds(input.noteContent.en), ...richDocMediaIds(input.noteContent.ne)];
      await this.media.assertPublicImages(ids);
      return {
        noteContent: input.noteContent as Prisma.InputJsonValue,
        pdfMediaId: null,
        videoAssetId: null,
        durationSeconds: null,
        downloadable: false,
      };
    }
    if (input.type === 'pdf') {
      await this.media.assertPdf(input.pdfMediaId);
      return {
        noteContent: Prisma.DbNull,
        pdfMediaId: input.pdfMediaId,
        videoAssetId: null,
        durationSeconds: null,
        downloadable: input.downloadable,
      };
    }
    const asset = await this.video.resolve(input.video, actor.userId);
    return {
      noteContent: Prisma.DbNull,
      pdfMediaId: null,
      videoAssetId: asset.id,
      durationSeconds: input.durationSeconds ?? asset.durationSeconds ?? null,
      downloadable: false,
    };
  }

  private async findLive(id: string): Promise<ItemWithRelations> {
    const item = await this.prisma.learningItem.findFirst({
      where: { id, deletedAt: null },
      include: { pdf: true, video: true },
    });
    if (!item) throw Errors.notFound('Item');
    return item;
  }

  private async adminView(item: ItemWithRelations) {
    return {
      id: item.id,
      topicId: item.topicId,
      type: item.type,
      title: item.title as LocalizedText,
      accessLevel: item.accessLevel,
      language: item.language,
      status: item.status,
      publishAt: item.publishAt?.toISOString() ?? null,
      sortOrder: item.sortOrder,
      noteContent: (item.noteContent as LocalizedRichDoc | null) ?? null,
      pdf: item.pdf ? await this.media.view(item.pdf) : null,
      downloadable: item.downloadable,
      video: item.video
        ? {
            id: item.video.id,
            provider: item.video.provider,
            providerVideoId: item.video.providerVideoId,
            status: item.video.status,
            title: item.video.title,
            thumbnailUrl: item.video.thumbnailUrl,
          }
        : null,
      durationSeconds: item.durationSeconds,
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
