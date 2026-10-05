import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/en';
import { ne } from '@/i18n/ne';
import { defaultLocale, localized, translate } from '@/i18n/translate';
import { appGate, compareVersions, type AppConfig } from './app-gate';
import {
  adIsoToBs,
  bsDateTime,
  bsToAdIso,
  countdown,
  kathmanduWeekday,
  nepalToday,
  todayLabel,
} from './dates';
import { devApiOrigin } from './dev-api';
import { formatDuration, marks, percent, price } from './format';
import { initialsOf } from './names';
import { routeGate } from './route-gate';
import { checkCode, checkEmail, checkPassword, toNepalE164 } from './validation';

describe('translations', () => {
  it('has a non-empty Nepali string for every English key and the same placeholders', () => {
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(ne[key], key).toBeTruthy();
      const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(vars(ne[key]), key).toEqual(vars(en[key]));
    }
    expect(Object.keys(ne).sort()).toEqual(Object.keys(en).sort());
  });

  it('fills placeholders, with Devanagari digits for numbers in Nepali', () => {
    expect(translate('en', 'onboarding.more', { count: 12 })).toBe('12 options');
    expect(translate('ne', 'onboarding.more', { count: 12 })).toBe('१२ विकल्प');
    expect(translate('ne', 'home.greeting', { name: 'Aarati' })).toBe('नमस्ते, Aarati');
  });

  it('picks CMS text in the reader language with fallback (D-008)', () => {
    expect(localized({ en: 'Constable', ne: 'जवान' }, 'ne')).toBe('जवान');
    expect(localized({ en: 'Constable' }, 'ne')).toBe('Constable');
    expect(localized({ ne: 'जवान' }, 'en')).toBe('जवान');
    expect(localized(null, 'en')).toBe('');
  });

  it('starts in Nepali only when the phone is set to Nepali', () => {
    expect(defaultLocale(['ne', 'en'])).toBe('ne');
    expect(defaultLocale(['en', null])).toBe('en');
  });
});

describe('dates (D-009)', () => {
  // 2026-10-03 03:00 UTC = 08:45 in Kathmandu, a Saturday; 17 Asoj 2083 BS.
  const instant = new Date('2026-10-03T03:00:00Z');

  it('formats today in BS with the Nepal weekday', () => {
    expect(todayLabel(instant, 'en')).toBe('Saturday, 17 Asoj 2083');
    expect(todayLabel(instant, 'ne')).toBe('शनिबार, १७ असोज २०८३');
  });

  it('uses the Kathmandu day, not the phone time zone', () => {
    // 20:00 UTC Friday is already Saturday 01:45 in Kathmandu.
    expect(kathmanduWeekday(new Date('2026-10-02T20:00:00Z'), 'en')).toBe('Saturday');
  });

  it('formats countdowns', () => {
    expect(countdown(42, 'en')).toBe('0:42');
    expect(countdown(60, 'ne')).toBe('१:००');
    expect(countdown(-3, 'en')).toBe('0:00');
  });
});

describe('maintenance and force update (S24)', () => {
  const config = (over: Partial<AppConfig> = {}): AppConfig => ({
    maintenance: { enabled: false, message: null },
    minVersions: { android: null, ios: null },
    storeLinks: { android: 'https://play.google.com/x', ios: null },
    purchaseChannels: { android: 'in_app', ios: 'web_only', web: 'enabled' },
    verification: { channels: { email: true, phone: false }, requiredForLearning: false },
    questionTypeLabels: {},
    enabledQuestionTypes: [],
    ...over,
  });

  it('compares semantic versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.9.1', '1.0.0')).toBe(-1);
  });

  it('asks old apps to update, with the store link for their platform', () => {
    const minVersions = { android: '1.2.0', ios: '1.2.0' };
    expect(appGate(config({ minVersions }), 'android', '1.1.9')).toEqual({
      kind: 'update',
      storeUrl: 'https://play.google.com/x',
    });
    expect(appGate(config({ minVersions }), 'ios', '1.1.9')).toEqual({ kind: 'update', storeUrl: null });
    expect(appGate(config({ minVersions }), 'android', '1.2.0')).toEqual({ kind: 'open' });
    expect(appGate(config({ minVersions }), 'web', '0.0.1')).toEqual({ kind: 'open' });
  });

  it('shows maintenance before anything else', () => {
    const message = { en: 'Back at 6 pm' };
    expect(
      appGate(
        config({ maintenance: { enabled: true, message }, minVersions: { android: '9.0.0', ios: null } }),
        'android',
        '1.0.0',
      ),
    ).toEqual({ kind: 'maintenance', message });
  });
});

describe('form checks', () => {
  it('mirrors the shared contracts', () => {
    expect(checkEmail(' Aarati@Example.com ')).toBeUndefined();
    expect(checkEmail('nope')).toBe('validation.email');
    expect(checkEmail('')).toBe('validation.required');
    expect(checkPassword('1234567')).toBe('validation.passwordLength');
    expect(checkPassword('12345678')).toBeUndefined();
    expect(checkCode('12345')).toBe('validation.code');
    expect(checkCode('123456')).toBeUndefined();
  });

  it('normalises Nepali mobile numbers to E.164', () => {
    expect(toNepalE164('9812345678')).toBe('+9779812345678');
    expect(toNepalE164('+977 974-123-4567')).toBe('+9779741234567');
    expect(toNepalE164('9612345678')).toBe('+9779612345678');
    expect(toNepalE164('014123456')).toBeNull();
    expect(toNepalE164('981234567')).toBeNull();
  });

  it('makes avatar initials', () => {
    expect(initialsOf('Aarati Sharma')).toBe('AS');
    expect(initialsOf('Ram Bahadur Thapa')).toBe('RT');
    expect(initialsOf('Sita')).toBe('SI');
    expect(initialsOf('  ')).toBe('');
  });
});

describe('development API address', () => {
  it('uses the computer that serves the app', () => {
    expect(devApiOrigin('web', 'localhost', undefined)).toBe('http://127.0.0.1:4000');
    expect(devApiOrigin('web', '192.168.1.20', undefined)).toBe('http://192.168.1.20:4000');
    expect(devApiOrigin('android', undefined, '192.168.1.20:8081')).toBe('http://192.168.1.20:4000');
    expect(devApiOrigin('ios', undefined, '10.0.0.5:8081')).toBe('http://10.0.0.5:4000');
    expect(devApiOrigin('android', undefined, undefined)).toBe('http://10.0.2.2:4000');
    expect(devApiOrigin('android', undefined, '127.0.0.1:8081')).toBe('http://10.0.2.2:4000');
    expect(devApiOrigin('ios', undefined, undefined)).toBe('http://localhost:4000');
  });
});

describe('learning formats', () => {
  it('formats video lengths, percentages and prices', () => {
    expect(formatDuration(629, 'en')).toBe('10:29');
    expect(formatDuration(3725, 'en')).toBe('1:02:05');
    expect(formatDuration(629, 'ne')).toBe('१०:२९');
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
    expect(percent(5, 4)).toBe(100);
    expect(price(300_000, 'en')).toBe('Rs 3,000');
    expect(price(10_000_000, 'en')).toBe('Rs 1,00,000');
  });
});

describe('date of birth (BS picker ⇄ AD storage)', () => {
  it('converts both ways', () => {
    expect(adIsoToBs('2026-10-03')).toEqual({ year: 2083, month: 6, day: 17 });
    expect(bsToAdIso({ year: 2083, month: 6, day: 17 })).toBe('2026-10-03');
    expect(bsToAdIso(adIsoToBs('2001-01-05'))).toBe('2001-01-05');
  });
});

describe('exam display helpers', () => {
  it('shows window times in Nepal time and marks with Devanagari digits for Nepali', () => {
    // 04:15 UTC = 10:00 in Nepal (UTC+5:45).
    expect(bsDateTime('2026-10-10T04:15:00Z', 'en')).toMatch(/2083, 10:00$/);
    expect(bsDateTime('2026-10-10T04:15:00Z', 'ne')).toMatch(/२०८३, १०:००$/);
    expect(marks(1250, 'en')).toBe('12.5');
    expect(marks(-50, 'en')).toBe('-0.5');
    expect(marks(200, 'ne')).toBe('२');
  });

  it('finds the Nepal calendar day (UTC+5:45), whatever the phone time zone', () => {
    expect(nepalToday(new Date('2026-10-05T18:14:00Z'))).toBe('2026-10-05'); // 23:59 in Nepal
    expect(nepalToday(new Date('2026-10-05T18:15:00Z'))).toBe('2026-10-06'); // midnight in Nepal
  });
});

describe('route gate', () => {
  const account = { id: 'u1', emailVerified: true, phoneVerified: false };
  const base = {
    signedIn: true,
    account,
    verifyPrompt: false,
    verificationRequired: false,
    targetCount: 0,
    skippedOnboarding: [] as string[],
  };
  it('decides nothing until the account has loaded (a skipped student is not sent back to onboarding)', () => {
    expect(routeGate({ ...base, account: undefined, skippedOnboarding: ['u1'] })).toEqual({
      mustVerify: false,
      needsOnboarding: false,
    });
    expect(routeGate({ ...base, skippedOnboarding: ['u1'] }).needsOnboarding).toBe(false);
    expect(routeGate(base).needsOnboarding).toBe(true);
    expect(routeGate({ ...base, targetCount: undefined }).needsOnboarding).toBe(false);
    expect(routeGate({ ...base, targetCount: 1 }).needsOnboarding).toBe(false);
  });

  it('asks unverified students to verify when prompted or required, before onboarding', () => {
    const unverified = { ...base, account: { ...account, emailVerified: false } };
    expect(routeGate({ ...unverified, verificationRequired: true })).toEqual({
      mustVerify: true,
      needsOnboarding: false,
    });
    expect(routeGate({ ...unverified, verifyPrompt: true }).mustVerify).toBe(true);
    expect(routeGate(unverified).mustVerify).toBe(false);
    expect(routeGate({ ...base, signedIn: false }).mustVerify).toBe(false);
  });
});
