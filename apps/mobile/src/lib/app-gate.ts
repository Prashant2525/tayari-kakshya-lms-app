import type { HomeSectionKey, LocalizedText } from '@tk/contracts';

/** The public part of `GET /app/config` this app uses. */
export interface AppConfig {
  maintenance: { enabled: boolean; message: LocalizedText | null };
  minVersions: { android: string | null; ios: string | null };
  storeLinks?: { android: string | null; ios: string | null };
  purchaseChannels: {
    android: 'in_app' | 'web_only' | 'disabled';
    ios: 'web_only' | 'disabled';
    web: 'enabled' | 'disabled';
  };
  verification: { channels: { email: boolean; phone: boolean }; requiredForLearning: boolean };
  /** D-059: whether sign-up shows the referral code field (older servers do not send it). */
  referrals?: { enabled: boolean };
  /** D-067: offline lessons (older servers do not send it). */
  offline?: { enabled: boolean; days: number };
  questionTypeLabels: Record<string, LocalizedText>;
  enabledQuestionTypes: string[];
  /** D-075: Home sections to show, in order (older servers do not send it). */
  homeSections?: HomeSectionKey[];
}

/** -1, 0 or 1 comparing two `major.minor.patch` versions (missing parts count as 0). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export type Gate =
  | { kind: 'open' }
  | { kind: 'maintenance'; message: LocalizedText | null }
  | { kind: 'update'; storeUrl: string | null };

/**
 * What the app must show before anything else (S24). Maintenance wins over a required update.
 * The web build (used for development and browser tests) is never forced to update.
 */
export function appGate(config: AppConfig, platform: string, appVersion: string): Gate {
  if (config.maintenance.enabled) return { kind: 'maintenance', message: config.maintenance.message };
  if (platform === 'android' || platform === 'ios') {
    const min = config.minVersions[platform];
    if (min && compareVersions(appVersion, min) < 0) {
      return { kind: 'update', storeUrl: config.storeLinks?.[platform] ?? null };
    }
  }
  return { kind: 'open' };
}
