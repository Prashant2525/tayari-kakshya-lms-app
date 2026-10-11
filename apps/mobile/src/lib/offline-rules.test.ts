import { describe, expect, it } from 'vitest';
import { base64Chunks, usable, withLocalMedia } from './offline-rules';

const at = (iso: string) => Date.parse(iso);

describe('offline lessons (D-067)', () => {
  it('opens a saved lesson until its licence expires', () => {
    const entry = { expiresAt: '2026-10-18T10:00:00Z' };
    expect(usable(entry, at('2026-10-17T10:00:00Z'), '2026-10-11T10:00:00Z')).toBe(true);
    expect(usable(entry, at('2026-10-18T10:00:00Z'), '2026-10-11T10:00:00Z')).toBe(false);
    expect(usable(entry, at('2026-10-19T00:00:00Z'), null)).toBe(false);
  });

  it('refuses a clock set back before the last server time (beyond a little slack)', () => {
    const entry = { expiresAt: '2026-10-18T10:00:00Z' };
    expect(usable(entry, at('2026-10-11T09:55:00Z'), '2026-10-11T10:00:00Z')).toBe(true);
    expect(usable(entry, at('2026-10-11T09:00:00Z'), '2026-10-11T10:00:00Z')).toBe(false);
  });

  it('points pictures at their saved files', () => {
    const media = {
      a: {
        url: 'https://cdn/a.webp',
        variants: { w320: 'https://cdn/a-320.webp', w640: 'https://cdn/a-640.webp' },
      },
      b: { url: 'https://cdn/b.webp', variants: {} },
    };
    expect(withLocalMedia(media, { a: 'file:///offline/media/x-a.webp' })).toEqual({
      a: {
        url: 'file:///offline/media/x-a.webp',
        variants: { w320: 'file:///offline/media/x-a.webp', w640: 'file:///offline/media/x-a.webp' },
      },
      b: media.b,
    });
  });

  it('cuts a saved PDF into pieces that decode on their own', () => {
    const bytes = Uint8Array.from({ length: 1000 }, (_, i) => (i * 37) % 256);
    const base64 = Buffer.from(bytes).toString('base64');
    const chunks = base64Chunks(base64, 103); // rounded down to 100 characters (75 bytes) a piece
    expect(chunks.join('')).toBe(base64);
    expect(chunks.slice(0, -1).every((c) => c.length === 100)).toBe(true);
    const decoded = Buffer.concat(chunks.map((c) => Buffer.from(c, 'base64')));
    expect([...decoded]).toEqual([...bytes]);
    expect(base64Chunks('')).toEqual([]);
  });
});
