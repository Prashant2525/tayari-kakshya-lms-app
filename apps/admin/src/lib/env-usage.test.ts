import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Vite copies every value the CMS reads into its JavaScript, which anyone can download — so it may only read public
 * `VITE_*` values and Vite's own flags (D-076). Secrets belong to the API.
 */
const VITE_FLAGS = new Set(['DEV', 'PROD', 'MODE', 'BASE_URL', 'SSR']);
const src = path.resolve(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('environment values the CMS reads (D-076)', () => {
  it('are public VITE_* values only', () => {
    const read = sources(src).flatMap((f) => {
      const text = readFileSync(f, 'utf8');
      return [
        ...[...text.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]!),
        ...[...text.matchAll(/process\.env(?:\.([A-Z0-9_]+)|\[['"]([A-Z0-9_]+)['"]\])/g)].map(
          (m) => `process.env.${m[1] ?? m[2]}`,
        ),
      ];
    });
    expect(read.filter((n) => !n.startsWith('VITE_') && !VITE_FLAGS.has(n))).toEqual([]);
  });
});
