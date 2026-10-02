/* eslint-disable no-console -- command-line script */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildQuestionTemplate } from '../modules/questions/import-template.js';

/** Writes the offline question import template (no live lists) to docs/templates. */
async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const out = path.resolve(here, '../../../../docs/templates/question-import-template.xlsx');
  await mkdir(path.dirname(out), { recursive: true });
  const wb = await buildQuestionTemplate();
  await wb.xlsx.writeFile(out);
  console.log(`Wrote ${out}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
