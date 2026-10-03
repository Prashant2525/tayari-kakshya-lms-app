import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { create } from 'zustand';
import { defaultLocale, type Locale } from '@/i18n/translate';

export type ThemePref = 'system' | 'light' | 'dark';

/** Reader text sizes (A− / A+), as multipliers of the reading style (DESIGN_SYSTEM §4: body.reading 17/28). */
export const READER_SCALES = [0.88, 1, 1.12, 1.25, 1.4] as const;

interface Stored {
  locale: Locale;
  theme: ThemePref;
  /** Users who skipped onboarding on this device (not asked again; they can choose later from Profile). */
  onboardingSkipped: string[];
  /** Index into READER_SCALES. */
  readerScale: number;
  /** The course shown on Home for each user on this device (D-011 course switcher). */
  currentCourse: Record<string, string>;
}

interface PrefsState extends Stored {
  loaded: boolean;
  load(): Promise<void>;
  setLocale(locale: Locale): void;
  setTheme(theme: ThemePref): void;
  skipOnboarding(userId: string): void;
  setReaderScale(index: number): void;
  setCurrentCourse(userId: string, courseId: string): void;
}

const KEY = 'tk.prefs';
const DEFAULT_SCALE = 1;

/** Non-secret, per-device preferences (T-034). */
export const usePrefs = create<PrefsState>((set, get) => {
  const save = () => {
    const { locale, theme, onboardingSkipped, readerScale, currentCourse } = get();
    void AsyncStorage.setItem(
      KEY,
      JSON.stringify({ locale, theme, onboardingSkipped, readerScale, currentCourse } satisfies Stored),
    ).catch(() => undefined);
  };
  return {
    loaded: false,
    locale: 'en',
    theme: 'system',
    onboardingSkipped: [],
    readerScale: DEFAULT_SCALE,
    currentCourse: {},
    async load() {
      const stored = await AsyncStorage.getItem(KEY)
        .then((raw) => JSON.parse(raw ?? '{}') as Partial<Stored>)
        .catch(() => ({}) as Partial<Stored>);
      const scale = Number(stored.readerScale);
      set({
        loaded: true,
        locale:
          stored.locale === 'ne' || stored.locale === 'en'
            ? stored.locale
            : defaultLocale(getLocales().map((l) => l.languageCode)),
        theme: stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : 'system',
        onboardingSkipped: Array.isArray(stored.onboardingSkipped) ? stored.onboardingSkipped : [],
        readerScale:
          Number.isInteger(scale) && scale >= 0 && scale < READER_SCALES.length ? scale : DEFAULT_SCALE,
        currentCourse:
          stored.currentCourse && typeof stored.currentCourse === 'object' ? stored.currentCourse : {},
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
    setReaderScale(index) {
      set({ readerScale: Math.min(Math.max(index, 0), READER_SCALES.length - 1) });
      save();
    },
    setCurrentCourse(userId, courseId) {
      set({ currentCourse: { ...get().currentCourse, [userId]: courseId } });
      save();
    },
  };
});
