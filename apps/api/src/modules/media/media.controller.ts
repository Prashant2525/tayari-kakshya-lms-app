import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ErrorCode, LocalizedText, MediaListQuery, MediaUploadFields } from '@tk/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  Audiences,
  Client,
  CurrentAuth,
  Public,
  RequireAnyPermission,
  RequirePermissions,
  type AuthContext,
  type ClientInfo,
} from '../../common/auth/auth-context.js';
import { AppError, Errors } from '../../common/errors/app-error.js';
import { RateLimit } from '../../common/security/rate-limit.js';
import { ApiZodBody, ZodBody, ZodQuery } from '../../common/validation/zod.js';
import { ENV, type Env } from '../../config/env.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { MediaService } from './media.service.js';

const AltTextInput = z.object({ altText: LocalizedText.nullable() });

@ApiTags('admin-media')
@ApiBearerAuth()
@Audiences('staff')
@Controller('admin/media')
export class AdminMediaController {
  constructor(private readonly media: MediaService) {}

  /** multipart/form-data: `file` + `visibility` (public|private) + optional `altEn` / `altNe`. */
  @Post()
  @RequirePermissions('media:manage')
  @RateLimit({ name: 'admin.media.upload', limit: 120, windowSeconds: 3600, by: ['user'] })
  @ApiConsumes('multipart/form-data')
  async upload(@Req() req: FastifyRequest, @CurrentAuth() auth: AuthContext, @Client() client: ClientInfo) {
    if (!req.isMultipart())
      throw Errors.validation([{ path: 'file', message: 'Send the file as multipart/form-data' }]);
    const part = await req.file();
    if (!part) throw Errors.validation([{ path: 'file', message: 'No file received' }]);
    let buffer: Buffer;
    try {
      buffer = await part.toBuffer();
    } catch {
      throw new AppError(413, ErrorCode.VALIDATION_FAILED, 'The file is too large');
    }
    const raw = Object.fromEntries(
      Object.entries(part.fields)
        .filter(([, f]) => f && !Array.isArray(f) && (f as { type?: string }).type === 'field')
        .map(([k, f]) => [k, (f as unknown as { value: string }).value]),
    );
    const fields = MediaUploadFields.safeParse(raw);
    if (!fields.success) {
      throw Errors.validation(
        fields.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    const { altEn, altNe, visibility } = fields.data;
    const altText =
      altEn || altNe ? { ...(altEn ? { en: altEn } : {}), ...(altNe ? { ne: altNe } : {}) } : null;
    return this.media.upload(
      { buffer, filename: part.filename },
      { visibility, altText },
      auth.userId,
      client,
    );
  }

  @Get()
  @RequireAnyPermission(
    'media:manage',
    'content:edit',
    'courses:edit',
    'taxonomy:manage',
    'instructors:manage',
  )
  list(@ZodQuery(MediaListQuery) query: MediaListQuery) {
    return this.media.list(query);
  }

  @Get(':id')
  @RequireAnyPermission(
    'media:manage',
    'content:edit',
    'courses:edit',
    'taxonomy:manage',
    'instructors:manage',
  )
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.media.get(id);
  }

  @Patch(':id')
  @RequirePermissions('media:manage')
  @ApiZodBody(AltTextInput)
  updateAlt(
    @Param('id', new ParseUUIDPipe()) id: string,
    @ZodBody(AltTextInput) body: z.infer<typeof AltTextInput>,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ) {
    return this.media.updateAlt(id, body.altText, auth.userId, client);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('media:manage')
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAuth() auth: AuthContext,
    @Client() client: ClientInfo,
  ) {
    await this.media.remove(id, auth.userId, client);
  }
}

/**
 * Development/test only: serves public objects through the API so local URLs work without a CDN.
 * In production PUBLIC_MEDIA_BASE_URL points at the R2 public domain and this route is disabled.
 */
@ApiTags('public-media')
@Controller('public-media')
export class PublicMediaController {
  constructor(
    private readonly storage: StorageService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Get('*')
  async serve(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    if (!this.env.PUBLIC_MEDIA_PROXY) throw Errors.notFound('File');
    const key = decodeURIComponent((req.url.split('?')[0] ?? '').replace(/^.*?\/public-media\//, ''));
    if (!/^[\w./-]+$/.test(key) || key.includes('..')) throw Errors.notFound('File');
    try {
      const object = await this.storage.get('public', key);
      void reply
        .header('Content-Type', object.contentType ?? 'application/octet-stream')
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .header('Cross-Origin-Resource-Policy', 'cross-origin')
        .send(object.body);
    } catch {
      throw Errors.notFound('File');
    }
  }
}
