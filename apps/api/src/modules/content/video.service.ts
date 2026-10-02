import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '@tk/contracts';
import { createHash } from 'node:crypto';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { ENV, type Env } from '../../config/env.js';
import type { VideoAsset } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Extracts the 11-character id from any common YouTube URL form (or a bare id). */
export function parseYouTubeId(input: string): string | null {
  const value = input.trim();
  if (YOUTUBE_ID.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const match = /^\/(embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname);
      id = match?.[2] ?? null;
    }
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** ISO-8601 duration (PT1H2M3S) → seconds. */
export function parseIsoDuration(value: string): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return (d ?? 0) * 86400 + (h ?? 0) * 3600 + (min ?? 0) * 60 + (s ?? 0);
}

/** Bunny Stream embed token: SHA256_HEX(token_security_key + video_id + expires) — per Bunny documentation. */
export function bunnyEmbedToken(securityKey: string, videoId: string, expires: number): string {
  return createHash('sha256').update(`${securityKey}${videoId}${expires}`).digest('hex');
}

const BUNNY_STATUS: Record<number, VideoAsset['status']> = {
  0: 'uploading',
  1: 'processing',
  2: 'processing',
  3: 'processing',
  4: 'ready',
  5: 'failed',
  6: 'failed',
  7: 'processing',
  8: 'ready',
};

export interface Playback {
  provider: 'youtube' | 'bunny';
  embedUrl: string;
  expiresAt: string | null;
}

/** Video sources behind one interface (D-015): Bunny Stream for premium, YouTube unlisted for free/promo. */
@Injectable()
export class VideoService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get bunnyConfigured(): boolean {
    return Boolean(this.env.BUNNY_STREAM_LIBRARY_ID && this.env.BUNNY_STREAM_API_KEY);
  }

  /** Registers (or reuses) the video asset referenced by a learning item. */
  async resolve(
    source: { provider: 'youtube'; url: string } | { provider: 'bunny'; videoId: string },
    actorUserId: string,
  ): Promise<VideoAsset> {
    if (source.provider === 'youtube') {
      const id = parseYouTubeId(source.url);
      if (!id) throw Errors.validation([{ path: 'video.url', message: 'Enter a valid YouTube link' }]);
      const meta = await this.youtubeMetadata(id);
      return this.prisma.videoAsset.upsert({
        where: { provider_providerVideoId: { provider: 'youtube', providerVideoId: id } },
        create: {
          provider: 'youtube',
          providerVideoId: id,
          status: 'ready',
          createdById: actorUserId,
          ...meta,
        },
        update: meta,
      });
    }
    const meta = await this.bunnyMetadata(source.videoId);
    return this.prisma.videoAsset.upsert({
      where: { provider_providerVideoId: { provider: 'bunny', providerVideoId: source.videoId } },
      create: { provider: 'bunny', providerVideoId: source.videoId, createdById: actorUserId, ...meta },
      update: meta,
    });
  }

  /** Playback for an entitled viewer. Bunny embeds are signed and expire; YouTube uses the privacy-enhanced player. */
  playback(asset: VideoAsset, now = Date.now()): Playback {
    if (asset.provider === 'youtube') {
      return {
        provider: 'youtube',
        embedUrl: `https://www.youtube-nocookie.com/embed/${asset.providerVideoId}?rel=0&modestbranding=1`,
        expiresAt: null,
      };
    }
    if (!this.env.BUNNY_STREAM_LIBRARY_ID) throw this.notConfigured();
    const base = `https://player.mediadelivery.net/embed/${this.env.BUNNY_STREAM_LIBRARY_ID}/${asset.providerVideoId}`;
    if (!this.env.BUNNY_STREAM_TOKEN_KEY) return { provider: 'bunny', embedUrl: base, expiresAt: null };
    const expires = Math.floor(now / 1000) + this.env.VIDEO_PLAYBACK_TTL_SECONDS;
    const token = bunnyEmbedToken(this.env.BUNNY_STREAM_TOKEN_KEY, asset.providerVideoId, expires);
    return {
      provider: 'bunny',
      embedUrl: `${base}?token=${token}&expires=${expires}`,
      expiresAt: new Date(expires * 1000).toISOString(),
    };
  }

  private async youtubeMetadata(id: string) {
    if (!this.env.YOUTUBE_API_KEY) return {};
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.search = new URLSearchParams({
      part: 'contentDetails,snippet',
      id,
      key: this.env.YOUTUBE_API_KEY,
    }).toString();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return {};
      const body = (await res.json()) as {
        items?: Array<{
          snippet?: { title?: string; thumbnails?: { high?: { url?: string } } };
          contentDetails?: { duration?: string };
        }>;
      };
      const item = body.items?.[0];
      if (!item)
        throw Errors.validation([
          { path: 'video.url', message: 'That YouTube video was not found or is private' },
        ]);
      return {
        title: item.snippet?.title?.slice(0, 300) ?? null,
        thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? null,
        durationSeconds: item.contentDetails?.duration
          ? parseIsoDuration(item.contentDetails.duration)
          : null,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      return {}; // metadata is optional; the admin can enter the duration
    }
  }

  private async bunnyMetadata(videoId: string) {
    if (!this.bunnyConfigured) throw this.notConfigured();
    const res = await fetch(
      `https://video.bunnycdn.com/library/${this.env.BUNNY_STREAM_LIBRARY_ID}/videos/${encodeURIComponent(videoId)}`,
      {
        headers: { AccessKey: this.env.BUNNY_STREAM_API_KEY as string, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (res.status === 404)
      throw Errors.validation([{ path: 'video.videoId', message: 'Video not found in the Bunny library' }]);
    if (!res.ok) throw new AppError(502, ErrorCode.INTERNAL_ERROR, 'Bunny Stream could not be reached');
    const body = (await res.json()) as {
      title?: string;
      length?: number;
      status?: number;
      thumbnailFileName?: string;
      guid?: string;
    };
    return {
      title: body.title?.slice(0, 300) ?? null,
      durationSeconds: body.length && body.length > 0 ? Math.round(body.length) : null,
      status: BUNNY_STATUS[body.status ?? 0] ?? 'processing',
      thumbnailUrl:
        this.env.BUNNY_CDN_HOSTNAME && body.thumbnailFileName && body.guid
          ? `https://${this.env.BUNNY_CDN_HOSTNAME}/${body.guid}/${body.thumbnailFileName}`
          : null,
    };
  }

  private notConfigured() {
    return new AppError(503, ErrorCode.VIDEO_PROVIDER_NOT_CONFIGURED, 'Bunny Stream is not configured yet');
  }
}
