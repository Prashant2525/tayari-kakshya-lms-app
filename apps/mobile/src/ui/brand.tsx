import { palette, radius } from '@tk/design-tokens';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n/use-t';
import { usePrefs } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { Text } from './text';

/** Placeholder mark until the owner supplies the real logo (DESIGN_SYSTEM: logo pending). */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <View
      aria-hidden
      style={[
        styles.mark,
        { width: size, height: size, borderRadius: size * 0.28, backgroundColor: palette.navy800 },
      ]}
    >
      <Text
        variant="h4"
        weight={700}
        style={{ color: palette.white, fontSize: size * 0.4, lineHeight: size * 0.5 }}
      >
        TK
      </Text>
    </View>
  );
}

export function Wordmark() {
  const { t } = useT();
  return (
    <View style={styles.row}>
      <LogoMark />
      <View>
        <Text variant="h4" weight={700}>
          {t('app.name')}
        </Text>
        <Text variant="bodySm" color="textSecondary">
          {t('app.tagline')}
        </Text>
      </View>
    </View>
  );
}

/** EN | ने switch shown before sign-in (D-008). */
export function LanguageToggle() {
  const { colors } = useTheme();
  const { t } = useT();
  const locale = usePrefs((s) => s.locale);
  const setLocale = usePrefs((s) => s.setLocale);
  return (
    <View
      role="radiogroup"
      aria-label={t('lang.label')}
      style={[styles.toggle, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {(['en', 'ne'] as const).map((l) => {
        const selected = l === locale;
        return (
          <Pressable
            key={l}
            role="radio"
            aria-checked={selected}
            aria-label={t(l === 'en' ? 'lang.en' : 'lang.ne')}
            onPress={() => setLocale(l)}
            style={[styles.toggleOption, selected && { backgroundColor: colors.primary }]}
          >
            <Text variant="label" style={{ color: selected ? colors.onPrimary : colors.textSecondary }}>
              {l === 'en' ? 'EN' : 'ने'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggle: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.full, padding: 3 },
  toggleOption: {
    minWidth: 44,
    minHeight: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
