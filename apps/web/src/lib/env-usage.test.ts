import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The website needs only addresses (D-076): it never holds a server secret. A `NEXT_PUBLIC_*` value would be copied
 * into the pages, so none is used.
 */
const ALLOWED = new Set(['API_BASE_URL', 'API_PUBLIC_URL', 'PUBLIC_WEB_URL', 'NODE_ENV', 'NEXT_RUNTIME']);
const src = path.resolve(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('environment values the website reads (D-076)', () => {
  it('are its addresses only — no secret, no NEXT_PUBLIC_ value', () => {
    const read = sources(src).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/process\.env(?:\.([A-Z0-9_]+)|\[['"]([A-Z0-9_]+)['"]\])/g)].map(
        (m) => m[1] ?? m[2]!,
      ),
    );
    expect(read.filter((n) => !ALLOWED.has(n))).toEqual([]);
  });
});
