/* eslint-disable no-console -- command-line tool: console output is its interface */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { courses, handoutFile, handoutFor } from '../pack.ts';
import { renderHandout } from '../pdf.ts';

/** Writes every chapter handout to tools/content-pack/out/ (to look at before importing). */
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../out');
await mkdir(out, { recursive: true });
for (const course of courses) {
  for (const chapter of course.chapters) {
    const bytes = await renderHandout(handoutFor(course, chapter));
    const file = path.join(out, handoutFile(course, chapter));
    await writeFile(file, bytes);
    console.log(`${file} (${Math.round(bytes.length / 1024)} KB)`);
  }
}
