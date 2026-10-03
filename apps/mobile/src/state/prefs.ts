import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { create } from 'zustand';
import { defaultLocale, type Locale } from '@/i18n/translate';

export type ThemePref = 'system' | 'light' | 'dark';

interface Stored {
  locale: Locale;
  theme: ThemePref;
  /** Users who skipped onboarding on this device (not asked again; they can choose later from Profile). */
  onboardingSkipped: string[];
}

interface PrefsState extends Stored {
  loaded: boolean;
  load(): Promise<void>;
  setLocale(locale: Locale): void;
  setTheme(theme: ThemePref): void;
  skipOnboarding(userId: string): void;
}

const KEY = 'tk.prefs';

/** Non-secret, per-device preferences (T-034). */
export const usePrefs = create<PrefsState>((set, get) => {
  const save = () => {
    const { locale, theme, onboardingSkipped } = get();
    void AsyncStorage.setItem(
      KEY,
      JSON.stringify({ locale, theme, onboardingSkipped } satisfies Stored),
    ).catch(() => undefined);
  };
  return {
    loaded: false,
    locale: 'en',
    theme: 'system',
    onboardingSkipped: [],
    async load() {
      const stored = await AsyncStorage.getItem(KEY)
        .then((raw) => JSON.parse(raw ?? '{}') as Partial<Stored>)
        .catch(() => ({}) as Partial<Stored>);
      set({
        loaded: true,
        locale:
          stored.locale === 'ne' || stored.locale === 'en'
            ? stored.locale
            : defaultLocale(getLocales().map((l) => l.languageCode)),
        theme: stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : 'system',
        onboardingSkipped: Array.isArray(stored.onboardingSkipped) ? stored.onboardingSkipped : [],
      });
    },
    setLocale(locale) {
      set({ locale });
      save();
    },
    setTheme(theme) {
      set({ theme });
      save();
    },
    skipOnboarding(userId) {
      if (get().onboardingSkipped.includes(userId)) return;
      set({ onboardingSkipped: [...get().onboardingSkipped, userId] });
      save();
    },
  };
});
