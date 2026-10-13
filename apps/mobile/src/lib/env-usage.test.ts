import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Everything the app reads from the environment ends up inside the app that students download, so it may only read
 * public values (D-076): `EXPO_PUBLIC_*`, plus a few names `app.config.ts` uses while building (never shipped).
 */
const BUILD_TIME_ONLY = new Set([
  'GOOGLE_SERVICES_JSON',
  'EAS_PROJECT_ID',
  'EAS_BUILD_PROFILE',
  'APP_IOS_BUNDLE_ID',
  'APP_ANDROID_PACKAGE',
]);
const root = path.resolve(__dirname, '../..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : sources(full);
    return /\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const namesIn = (text: string) =>
  [...text.matchAll(/process\.env(?:\.([A-Z0-9_]+)|\[['"]([A-Z0-9_]+)['"]\])/g)].map((m) => m[1] ?? m[2]!);

describe('environment values the app reads (D-076)', () => {
  it('are public (EXPO_PUBLIC_*) in the app code', () => {
    const read = sources(path.join(root, 'src')).flatMap((f) => namesIn(readFileSync(f, 'utf8')));
    expect(read.filter((n) => !n.startsWith('EXPO_PUBLIC_') && n !== 'NODE_ENV')).toEqual([]);
  });

  it('are public or build-time only in app.config.ts', () => {
    const read = namesIn(readFileSync(path.join(root, 'app.config.ts'), 'utf8'));
    expect(read.filter((n) => !n.startsWith('EXPO_PUBLIC_') && !BUILD_TIME_ONLY.has(n))).toEqual([]);
  });
});
