import { describe, expect, it } from 'vitest';
import { LocalizedText, LoginInput, RegisterInput, SETTINGS, SETTING_KEYS, UpdateMeInput } from './index.js';

const device = { deviceId: 'install-12345678', deviceName: 'Pixel 8', platform: 'android' as const };

describe('LocalizedText', () => {
  it('requires at least one language', () => {
    expect(LocalizedText.safeParse({ en: 'Nepal Police' }).success).toBe(true);
    expect(LocalizedText.safeParse({ ne: 'नेपाल प्रहरी' }).success).toBe(true);
    expect(LocalizedText.safeParse({}).success).toBe(false);
    expect(LocalizedText.safeParse({ en: '   ' }).success).toBe(false);
    expect(LocalizedText.safeParse({ en: 'x', fr: 'y' }).success).toBe(false);
  });
});

describe('auth inputs', () => {
  it('normalizes email and requires accepted terms', () => {
    const parsed = RegisterInput.parse({
      fullName: 'Asha Rai',
      email: '  Asha@Example.COM ',
      password: 'correct horse',
      acceptTerms: true,
      device,
    });
    expect(parsed.email).toBe('asha@example.com');
    expect(parsed.locale).toBe('en');
    expect(
      RegisterInput.safeParse({
        fullName: 'Asha',
        email: 'a@b.co',
        password: 'longenough',
        acceptTerms: false,
        device,
      }).success,
    ).toBe(false);
  });

  it('rejects short passwords at registration but not at login', () => {
    const base = { fullName: 'Asha Rai', email: 'a@b.co', acceptTerms: true, device };
    expect(RegisterInput.safeParse({ ...base, password: 'short' }).success).toBe(false);
    expect(LoginInput.safeParse({ email: 'a@b.co', password: 'short', device }).success).toBe(true);
  });

  it('rejects unknown profile fields (no mass assignment)', () => {
    expect(UpdateMeInput.safeParse({ fullName: 'Asha Rai' }).success).toBe(true);
    expect(UpdateMeInput.safeParse({ kind: 'staff' }).success).toBe(false);
  });
});

describe('settings registry', () => {
  it('has a default that satisfies each schema', () => {
    for (const key of SETTING_KEYS) {
      const { schema, default: value } = SETTINGS[key];
      expect(schema.safeParse(value).success, key).toBe(true);
    }
  });
});
