import { describe, expect, it } from 'vitest';
import { websiteEnvProblems } from './env-check';

describe('websiteEnvProblems', () => {
  it('accepts a production configuration', () => {
    expect(
      websiteEnvProblems({
        API_BASE_URL: 'http://api:4000',
        API_PUBLIC_URL: 'https://api.example.np',
        PUBLIC_WEB_URL: 'https://example.np',
      }),
    ).toEqual([]);
  });

  it('allows http on this computer (production build tried out locally)', () => {
    expect(
      websiteEnvProblems({ API_BASE_URL: 'http://127.0.0.1:4100', PUBLIC_WEB_URL: 'http://localhost:3100' }),
    ).toEqual([]);
  });

  it('names what is missing or wrong, never the value', () => {
    const problems = websiteEnvProblems({
      PUBLIC_WEB_URL: 'http://secret-host.example',
      API_PUBLIC_URL: 'nope',
    });
    expect(problems).toEqual([
      'API_BASE_URL is required',
      'PUBLIC_WEB_URL must start with https://',
      'API_PUBLIC_URL is not a valid address',
    ]);
    expect(problems.join(' ')).not.toContain('secret-host');
  });
});
