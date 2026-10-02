import { describe, expect, it } from 'vitest';
import { bunnyEmbedToken, parseIsoDuration, parseYouTubeId } from './video.service.js';

describe('Bunny embed token', () => {
  // Formula from Bunny's docs: SHA256_HEX(token_security_key + video_id + expiration), applied to the docs' example
  // inputs. Expected value computed independently with `sha256sum`. (The token shown in Bunny's sample URL belongs to
  // different, unpublished inputs, so it is not usable as a test vector.)
  it('hashes key + video id + expiry as hex SHA-256', () => {
    expect(
      bunnyEmbedToken(
        '4742a81b-bf15-42fe-8b1c-8fcb9024c550',
        '32d140e2-e4f4-4eec-9d53-20371e9be607',
        1623440202,
      ),
    ).toBe('a8617f6df2e9b55b65ac7112138c70417766d80614bfe146d0d9bb2bd21fef87');
  });
});

describe('YouTube ids', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=42', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'dQw4w9WgXcQ'],
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('parses %s', (input, id) => expect(parseYouTubeId(input)).toBe(id));

  it.each([
    'https://vimeo.com/123',
    'https://evil.example/watch?v=dQw4w9WgXcQ',
    'not a url',
    'https://youtube.com/watch?v=short',
  ])('rejects %s', (input) => expect(parseYouTubeId(input)).toBeNull());

  it('parses ISO-8601 durations', () => {
    expect(parseIsoDuration('PT1H2M3S')).toBe(3723);
    expect(parseIsoDuration('PT45S')).toBe(45);
    expect(parseIsoDuration('P1DT1M')).toBe(86460);
    expect(parseIsoDuration('garbage')).toBeNull();
  });
});
