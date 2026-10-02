import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatDuration,
  imageVariant,
  isoToNepalLocal,
  nepalLocalToIso,
  parseDuration,
  slugify,
  toLocalized,
} from './content';
import { plural } from './format';

describe('content helpers', () => {
  it('builds URL slugs the API accepts', () => {
    const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    expect(slugify('Nepal Police')).toBe('nepal-police');
    expect(slugify('  Paper I: General Awareness!! ')).toBe('paper-i-general-awareness');
    expect(slugify('Kharidar (Non-Gazetted 2nd Class)')).toBe('kharidar-non-gazetted-2nd-class');
    expect(slugify('Café — Ñandú')).toBe('cafe-nandu');
    expect(slugify('नेपाल प्रहरी')).toBe(''); // Nepali-only names need a typed URL name
    const long = slugify('a'.repeat(79) + ' b');
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long).toMatch(slug);
  });

  it('only sends the languages that were filled in', () => {
    expect(toLocalized(' English ', '')).toEqual({ en: 'English' });
    expect(toLocalized('', 'नेपाली')).toEqual({ ne: 'नेपाली' });
    expect(toLocalized('  ', null)).toBeNull();
  });

  it('picks the smallest image variant that is wide enough', () => {
    const media = { url: 'orig', variants: { w1280: 'big', w320: 'small', w640: 'medium' } };
    expect(imageVariant(media, 320)).toBe('small');
    expect(imageVariant(media, 500)).toBe('medium');
    expect(imageVariant(media, 2000)).toBe('orig');
    expect(imageVariant({ url: 'orig', variants: {} })).toBe('orig');
  });

  it('formats sizes and counts', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(plural(1, 'paper')).toBe('1 paper');
    expect(plural(3, 'paper')).toBe('3 papers');
  });

  it('parses and formats video durations', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('75')).toBe(75);
    expect(parseDuration('4:05')).toBe(245);
    expect(parseDuration('1:05:09')).toBe(3909);
    for (const bad of ['4:60', 'abc', '1:2:3:4', '-5']) expect(parseDuration(bad)).toBeNaN();
    expect(formatDuration(245)).toBe('4:05');
    expect(formatDuration(3909)).toBe('1:05:09');
    expect(formatDuration(null)).toBe('');
  });

  it('treats schedule inputs as Nepal time regardless of the browser time zone', () => {
    expect(nepalLocalToIso('2026-10-05T09:00')).toBe('2026-10-05T03:15:00.000Z');
    expect(isoToNepalLocal('2026-10-05T03:15:00.000Z')).toBe('2026-10-05T09:00');
    expect(nepalLocalToIso('')).toBeNull();
  });
});
