import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode, type LocalizedText, type MediaListQuery } from '@tk/contracts';
import { fileTypeFromBuffer } from 'file-type';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { v7 as uuidv7 } from 'uuid';
import type { ClientInfo } from '../../common/auth/auth-context.js';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { ENV, type Env } from '../../config/env.js';
import type { MediaAsset, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IMAGE_WIDTHS = [320, 640, 1280] as const;
const MAX_IMAGE_EDGE = 2560;
const MAX_IMAGE_PIXELS = 40_000_000;

export interface UploadedFile {
  buffer: Buffer;
  filename: string;
}

export interface MediaView {
  id: string;
  kind: 'image' | 'pdf';
  visibility: 'public' | 'private';
  url: string;
  variants: Record<string, string>;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  pageCount: number | null;
  altText: LocalizedText | null;
  createdAt: string;
}

const datePrefix = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Media library. Every upload is validated before it reaches storage: real type from magic bytes (not the
 * filename), size limits, images re-encoded to WebP (strips EXIF/GPS metadata and any embedded payloads),
 * PDFs parsed and rejected if encrypted. PDFs are always private.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async upload(
    file: UploadedFile,
    opts: { visibility: 'public' | 'private'; altText: LocalizedText | null },
    actorUserId: string,
    client: ClientInfo,
  ): Promise<MediaView> {
    const detected = await fileTypeFromBuffer(file.buffer);
    const mime = detected?.mime ?? 'application/octet-stream';
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const originalName = file.filename.slice(0, 200) || 'upload';

    let asset: MediaAsset;
    if (IMAGE_TYPES.has(mime)) {
      this.assertSize(file.buffer, this.env.MEDIA_MAX_IMAGE_MB, 'Images');
      const existing = await this.findDuplicate(sha256, 'image', opts.visibility);
      if (existing) return this.view(existing);
      asset = await this.storeImage(file.buffer, { originalName, sha256, ...opts, actorUserId });
    } else if (mime === 'application/pdf') {
      this.assertSize(file.buffer, this.env.MEDIA_MAX_PDF_MB, 'PDFs');
      const existing = await this.findDuplicate(sha256, 'pdf', 'private');
      if (existing) return this.view(existing);
      asset = await this.storePdf(file.buffer, { originalName, sha256, actorUserId });
    } else {
      throw new AppError(
        415,
        ErrorCode.VALIDATION_FAILED,
        'Only JPEG, PNG, WebP images and PDF files are accepted',
        {
          detected: mime,
        },
      );
    }

    await this.audit.record({
      actorUserId,
      action: 'media.upload',
      entityType: 'media_asset',
      entityId: asset.id,
      changes: {
        after: { kind: asset.kind, visibility: asset.visibility, originalName, sizeBytes: asset.sizeBytes },
      },
      client,
    });
    return this.view(asset);
  }

  async list(query: MediaListQuery) {
    const where: Prisma.MediaAssetWhereInput = {
      deletedAt: null,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.q ? { originalName: { contains: query.q, mode: 'insensitive' } } : {}),
      ...(query.cursor ? { id: { lt: query.cursor } } : {}),
    };
    const rows = await this.prisma.mediaAsset.findMany({
      where,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    return {
      data: await Promise.all(page.map((a) => this.view(a))),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async get(id: string): Promise<MediaView> {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id, deletedAt: null } });
    if (!asset) throw Errors.notFound('File');
    return this.view(asset);
  }

  async updateAlt(id: string, altText: LocalizedText | null, actorUserId: string, client: ClientInfo) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id, deletedAt: null } });
    if (!asset) throw Errors.notFound('File');
    const updated = await this.prisma.mediaAsset.update({
      where: { id },
      data: { altText: (altText ?? undefined) as Prisma.InputJsonValue | undefined },
    });
    await this.audit.record({
      actorUserId,
      action: 'media.update',
      entityType: 'media_asset',
      entityId: id,
      client,
    });
    return this.view(updated);
  }

  /** Soft-deletes a file that nothing references. Objects stay in storage so restores and audits remain possible. */
  async remove(id: string, actorUserId: string, client: ClientInfo): Promise<void> {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id, deletedAt: null } });
    if (!asset) throw Errors.notFound('File');
    const usage = await this.usageCount(id);
    if (usage > 0) {
      throw Errors.conflict(ErrorCode.CONFLICT, 'This file is in use. Remove it from content first.', {
        usage,
      });
    }
    await this.prisma.mediaAsset.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      actorUserId,
      action: 'media.delete',
      entityType: 'media_asset',
      entityId: id,
      client,
    });
  }

  /** Throws unless every id is a live, public image (used for icons, thumbnails and images inside notes). */
  async assertPublicImages(ids: Array<string | null | undefined>): Promise<void> {
    const wanted = [...new Set(ids.filter((v): v is string => Boolean(v)))];
    if (wanted.length === 0) return;
    const found = await this.prisma.mediaAsset.count({
      where: { id: { in: wanted }, kind: 'image', visibility: 'public', deletedAt: null },
    });
    if (found !== wanted.length) {
      throw Errors.validation([
        { path: 'media', message: 'Images must be public images from the media library' },
      ]);
    }
  }

  async assertPdf(id: string): Promise<void> {
    const found = await this.prisma.mediaAsset.count({ where: { id, kind: 'pdf', deletedAt: null } });
    if (!found)
      throw Errors.validation([{ path: 'pdfMediaId', message: 'Choose a PDF from the media library' }]);
  }

  /** URL for a public image by id (null if missing). Used when rendering content for students. */
  async publicImageUrls(
    ids: string[],
  ): Promise<Record<string, { url: string; variants: Record<string, string> }>> {
    if (ids.length === 0) return {};
    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: ids }, visibility: 'public', deletedAt: null },
    });
    return Object.fromEntries(
      assets.map((a) => [a.id, { url: this.storage.publicUrl(a.objectKey), variants: this.variantUrls(a) }]),
    );
  }

  private async usageCount(id: string): Promise<number> {
    const [items, courses, nodes, subjects, instructors, inNotes] = await Promise.all([
      this.prisma.learningItem.count({ where: { pdfMediaId: id, deletedAt: null } }),
      this.prisma.course.count({ where: { thumbnailMediaId: id, deletedAt: null } }),
      this.prisma.examNode.count({ where: { iconMediaId: id, deletedAt: null } }),
      this.prisma.subject.count({ where: { iconMediaId: id, deletedAt: null } }),
      this.prisma.instructorProfile.count({ where: { photoMediaId: id } }),
      this.prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT COUNT(*)::bigint AS n FROM learning_items
        WHERE deleted_at IS NULL AND note_content::text LIKE ${'%' + id + '%'}`,
    ]);
    return items + courses + nodes + subjects + instructors + Number(inNotes[0]?.n ?? 0);
  }

  private assertSize(buffer: Buffer, maxMb: number, label: string): void {
    if (buffer.length > maxMb * 1024 * 1024) {
      throw new AppError(413, ErrorCode.VALIDATION_FAILED, `${label} must be ${maxMb} MB or smaller`);
    }
  }

  private findDuplicate(sha256: string, kind: 'image' | 'pdf', visibility: 'public' | 'private') {
    return this.prisma.mediaAsset.findFirst({ where: { sha256, kind, visibility, deletedAt: null } });
  }

  private async storeImage(
    buffer: Buffer,
    meta: {
      originalName: string;
      sha256: string;
      visibility: 'public' | 'private';
      altText: LocalizedText | null;
      actorUserId: string;
    },
  ): Promise<MediaAsset> {
    const base = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS }).rotate();
    try {
      await base.metadata();
    } catch {
      throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'The image could not be read');
    }
    const id = uuidv7();
    const prefix = `images/${datePrefix()}/${id}`;
    const main = await base
      .clone()
      .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    await this.storage.put(meta.visibility, `${prefix}/original.webp`, main.data, 'image/webp');

    const variants: Record<string, string> = {};
    for (const width of IMAGE_WIDTHS) {
      if ((main.info.width ?? 0) <= width) continue;
      const out = await base.clone().resize({ width }).webp({ quality: 80 }).toBuffer();
      const key = `${prefix}/w${width}.webp`;
      await this.storage.put(meta.visibility, key, out, 'image/webp');
      variants[`w${width}`] = key;
    }
    return this.prisma.mediaAsset.create({
      data: {
        id,
        kind: 'image',
        visibility: meta.visibility,
        objectKey: `${prefix}/original.webp`,
        originalName: meta.originalName,
        mimeType: 'image/webp',
        sizeBytes: main.data.length,
        sha256: meta.sha256,
        width: main.info.width,
        height: main.info.height,
        variants,
        altText: (meta.altText ?? undefined) as Prisma.InputJsonValue | undefined,
        uploadedById: meta.actorUserId,
      },
    });
  }

  private async storePdf(
    buffer: Buffer,
    meta: { originalName: string; sha256: string; actorUserId: string },
  ): Promise<MediaAsset> {
    let pageCount: number;
    try {
      const doc = await PDFDocument.load(buffer, { updateMetadata: false });
      pageCount = doc.getPageCount();
    } catch (err) {
      const encrypted = /encrypt/i.test((err as Error).message);
      throw new AppError(
        422,
        ErrorCode.VALIDATION_FAILED,
        encrypted ? 'Password-protected PDFs are not supported' : 'The PDF could not be read',
      );
    }
    const id = uuidv7();
    const key = `pdfs/${datePrefix()}/${id}.pdf`;
    await this.storage.put('private', key, buffer, 'application/pdf');
    return this.prisma.mediaAsset.create({
      data: {
        id,
        kind: 'pdf',
        visibility: 'private',
        objectKey: key,
        originalName: meta.originalName,
        mimeType: 'application/pdf',
        sizeBytes: buffer.length,
        sha256: meta.sha256,
        pageCount,
        uploadedById: meta.actorUserId,
      },
    });
  }

  private variantUrls(asset: MediaAsset): Record<string, string> {
    const variants = (asset.variants ?? {}) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(variants).map(([name, key]) => [name, this.storage.publicUrl(key)]),
    );
  }

  async view(asset: MediaAsset): Promise<MediaView> {
    const isPublic = asset.visibility === 'public';
    return {
      id: asset.id,
      kind: asset.kind,
      visibility: asset.visibility,
      url: isPublic ? this.storage.publicUrl(asset.objectKey) : await this.storage.signedUrl(asset.objectKey),
      variants: isPublic ? this.variantUrls(asset) : {},
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      width: asset.width,
      height: asset.height,
      pageCount: asset.pageCount,
      altText: (asset.altText as LocalizedText | null) ?? null,
      createdAt: asset.createdAt.toISOString(),
    };
  }
}
