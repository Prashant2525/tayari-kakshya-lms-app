import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { ENV, type Env } from '../../config/env.js';

export type BucketKind = 'public' | 'private';

/**
 * S3-compatible object storage (Cloudflare R2 in production, SeaweedFS locally).
 * Public objects are served from PUBLIC_MEDIA_BASE_URL; private objects only through short-lived signed URLs.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger('StorageService');
  private readonly s3: S3Client;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.env.STORAGE_AUTO_CREATE_BUCKETS) return;
    for (const bucket of [this.env.S3_BUCKET_PUBLIC, this.env.S3_BUCKET_PRIVATE]) {
      try {
        await this.s3.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await this.s3.send(new CreateBucketCommand({ Bucket: bucket }));
        this.logger.log(`Created bucket ${bucket}`);
      }
    }
  }

  bucket(kind: BucketKind): string {
    return kind === 'public' ? this.env.S3_BUCKET_PUBLIC : this.env.S3_BUCKET_PRIVATE;
  }

  async put(kind: BucketKind, key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket(kind),
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: kind === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-store',
      }),
    );
  }

  async get(
    kind: BucketKind,
    key: string,
  ): Promise<{ body: Readable; contentType?: string; length?: number }> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket(kind), Key: key }));
    return { body: res.Body as Readable, contentType: res.ContentType, length: res.ContentLength };
  }

  async getBuffer(kind: BucketKind, key: string): Promise<Buffer> {
    const { body } = await this.get(kind, key);
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }

  async delete(kind: BucketKind, key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket(kind), Key: key }));
  }

  /** Public, cacheable URL (objects are immutable; keys change when content changes). */
  publicUrl(key: string): string {
    return `${this.env.PUBLIC_MEDIA_BASE_URL.replace(/\/$/, '')}/${key}`;
  }

  /** Short-lived signed URL for a private object. */
  signedUrl(key: string, opts: { expiresInSeconds?: number; downloadName?: string } = {}): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.env.S3_BUCKET_PRIVATE,
        Key: key,
        ResponseContentDisposition: opts.downloadName
          ? `attachment; filename="${opts.downloadName.replace(/[^\w.\- ]/g, '_')}"`
          : undefined,
      }),
      { expiresIn: opts.expiresInSeconds ?? 600 },
    );
  }
}
