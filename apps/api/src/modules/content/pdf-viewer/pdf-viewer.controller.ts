import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Public } from '../../../common/auth/auth-context.js';
import { Errors } from '../../../common/errors/app-error.js';
import { ENV, type Env } from '../../../config/env.js';
import { offlineReader, pdfjsDir } from './offline-reader.js';
import { VIEWER_CSS, VIEWER_HTML, VIEWER_JS } from './viewer-files.js';

/** Only these pdf.js files are served (legacy build for older Android WebViews). */
const PDFJS_FILES: Record<string, string> = {
  'pdf.min.mjs': 'legacy/build/pdf.min.mjs',
  'pdf.worker.min.mjs': 'legacy/build/pdf.worker.min.mjs',
};
const DATA_DIRS = new Set(['standard_fonts', 'cmaps', 'wasm']);
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const TYPES: Record<string, string> = {
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.pfb': 'application/octet-stream',
  '.bcmap': 'application/octet-stream',
};

/** Self-hosted PDF reader page for the student app (T-038). Public: it holds no data; PDFs need the student's token. */
@ApiExcludeController()
@Public()
@Controller('viewer')
export class PdfViewerController {
  private readonly cache = new Map<string, Buffer>();

  constructor(@Inject(ENV) private readonly env: Env) {}

  @Get('pdf')
  page(@Res() reply: FastifyReply) {
    // The app embeds this page: allow its web origins (and localhost on a developer machine) to frame it.
    const ancestors = [
      "'self'",
      ...this.env.CORS_ALLOWED_ORIGINS,
      ...(this.env.APP_ENV === 'development' ? ['http://localhost:*', 'http://127.0.0.1:*'] : []),
    ].join(' ');
    void reply
      .removeHeader('x-frame-options')
      .header(
        'Content-Security-Policy',
        [
          "default-src 'none'",
          "script-src 'self' 'wasm-unsafe-eval'",
          "worker-src 'self'",
          "connect-src 'self'",
          "img-src 'self' data: blob:",
          "style-src 'self'",
          "font-src 'self' data:",
          "base-uri 'none'",
          "form-action 'none'",
          `frame-ancestors ${ancestors}`,
        ].join('; '),
      )
      .header('Cache-Control', 'no-cache')
      .type('text/html; charset=utf-8')
      .send(VIEWER_HTML);
  }

  /** The self-contained reader the app saves with a downloaded PDF (D-067); it carries no data. */
  @Get('pdf-offline')
  async offline(@Res() reply: FastifyReply) {
    const reader = await offlineReader();
    void reply
      .header('Cache-Control', 'no-cache')
      .header('X-Reader-Version', reader.version)
      .type('text/html; charset=utf-8')
      .send(reader.html);
  }

  @Get('assets/:file')
  async asset(@Param('file') file: string, @Res() reply: FastifyReply) {
    if (file === 'viewer.mjs') return this.sendText(reply, VIEWER_JS, '.mjs');
    if (file === 'viewer.css') return this.sendText(reply, VIEWER_CSS, '.css');
    const relative = PDFJS_FILES[file];
    if (!relative) throw Errors.notFound('File');
    return this.sendFile(reply, relative);
  }

  @Get('assets/:dir/:file')
  async data(@Param('dir') dir: string, @Param('file') file: string, @Res() reply: FastifyReply) {
    if (!DATA_DIRS.has(dir) || !SAFE_NAME.test(file)) throw Errors.notFound('File');
    return this.sendFile(reply, `${dir}/${file}`);
  }

  private sendText(reply: FastifyReply, body: string, ext: string) {
    void reply
      .header('Cache-Control', 'no-cache')
      .type(TYPES[ext] ?? 'text/plain')
      .send(body);
  }

  private async sendFile(reply: FastifyReply, relative: string) {
    let body = this.cache.get(relative);
    if (!body) {
      body = await readFile(path.join(pdfjsDir, relative)).catch(() => undefined);
      if (!body) throw Errors.notFound('File');
      this.cache.set(relative, body);
    }
    void reply
      .header('Cache-Control', 'public, max-age=86400')
      .type(TYPES[path.extname(relative)] ?? 'application/octet-stream')
      .send(body);
  }
}
