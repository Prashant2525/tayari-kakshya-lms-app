import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { OFFLINE_VIEWER_JS, VIEWER_CSS } from './viewer-files.js';

export const pdfjsDir = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));

/** The CSP of the offline page: nothing may be loaded or sent anywhere. */
const OFFLINE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data: blob:',
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** A pdf.js module build as a script for an inline module: its closing `export { … }` removed (it sets a global). */
export function inlineModule(code: string, global: string): string {
  if (!code.includes(`globalThis.${global}=`)) throw new Error(`pdf.js build does not set ${global}`);
  const body = code.replace(/export\s*\{[^}]*\};?\s*$/, '');
  if (/(^|[;}\s])export\s*\{/.test(body)) throw new Error('pdf.js build has more than one export');
  // A literal "</script" would end the inline script early.
  return body.replace(/<\/script/gi, '<\\/script');
}

/**
 * The offline PDF reader (D-067, 14a-2): one self-contained page — pdf.js and its worker inlined (the worker runs on
 * the main thread), the reader script and styles — that the app saves next to a downloaded PDF and opens without
 * internet. Standard fonts, CMaps and image codecs are not included: PDFs relying on them fall back to system fonts,
 * and JPEG 2000 / JBIG2 images do not show offline.
 */
export function offlineReaderHtml(pdfJs: string, workerJs: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${OFFLINE_CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<title>PDF</title>
<style>${VIEWER_CSS}</style>
</head>
<body>
<main id="pages" aria-label="PDF pages"></main>
<p id="status" role="status"></p>
<script type="module">${inlineModule(workerJs, 'pdfjsWorker')}</script>
<script type="module">${inlineModule(pdfJs, 'pdfjsLib')}</script>
<script type="module">${OFFLINE_VIEWER_JS}</script>
</body>
</html>
`;
}

let built: Promise<{ html: string; version: string }> | null = null;

/** The offline reader page and its version (a hash: the app saves a new copy when it changes). Built once. */
export function offlineReader(): Promise<{ html: string; version: string }> {
  built ??= (async () => {
    const [pdfJs, workerJs] = await Promise.all([
      readFile(path.join(pdfjsDir, 'legacy/build/pdf.min.mjs'), 'utf8'),
      readFile(path.join(pdfjsDir, 'legacy/build/pdf.worker.min.mjs'), 'utf8'),
    ]);
    const html = offlineReaderHtml(pdfJs, workerJs);
    return { html, version: createHash('sha256').update(html).digest('hex').slice(0, 16) };
  })().catch((err: unknown) => {
    built = null;
    throw err;
  });
  return built;
}
