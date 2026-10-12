import { radius } from '@tk/design-tokens';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Locale } from '@/i18n/translate';
import { usePrefs } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { Text } from '@/ui/text';

const OPTIONS: Array<{ locale: Locale; label: string; hint: string }> = [
  { locale: 'en', label: 'English', hint: 'Use the app in English' },
  { locale: 'ne', label: 'नेपाली', hint: 'एप नेपालीमा प्रयोग गर्नुहोस्' },
];

/**
 * First launch (D-074 / audit F-06): the student picks English or नेपाली before signing in. Shown in both languages
 * because none is chosen yet; it can be changed later in Profile. Starts on the phone's language.
 */
export function LanguageChoice() {
  const { colors } = useTheme();
  const current = usePrefs((s) => s.locale);
  const choose = usePrefs((s) => s.chooseLanguage);
  const [picked, setPicked] = useState<Locale>(current);
  return (
    <SafeAreaView style={[StyleSheet.absoluteFill, styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.body}>
        <View style={{ gap: 6 }}>
          <Text variant="h1" role="heading">
            Choose your language
          </Text>
          <Text variant="h3" color="textSecondary">
            भाषा छान्नुहोस्
          </Text>
        </View>
        <View role="radiogroup" aria-label="Language / भाषा" style={{ gap: 12 }}>
          {OPTIONS.map((o) => {
            const selected = picked === o.locale;
            return (
              <Pressable
                key={o.locale}
                role="radio"
                aria-checked={selected}
                aria-label={o.label}
                onPress={() => setPicked(o.locale)}
                style={[
                  styles.option,
                  {
                    backgroundColor: selected ? colors.primarySoft : colors.surface,
                    borderColor: selected ? colors.primary : colors.border,
                    borderWidth: selected ? 2 : 1,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="h3">{o.label}</Text>
                  <Text variant="bodySm" color="textSecondary">
                    {o.hint}
                  </Text>
                </View>
                {selected ? <Check size={22} color={colors.primary} strokeWidth={2.25} /> : null}
              </Pressable>
            );
          })}
        </View>
        <Text variant="bodySm" color="textMuted">
          You can change this later in Profile. · पछि प्रोफाइलमा बदल्न सकिन्छ।
        </Text>
      </View>
      <View style={styles.footer}>
        <Button label={picked === 'ne' ? 'जारी राख्नुहोस्' : 'Continue'} onPress={() => choose(picked)} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'space-between' },
  body: { padding: 24, gap: 28, paddingTop: 48, width: '100%', maxWidth: 520, alignSelf: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderRadius: radius.lg },
  footer: { padding: 24, width: '100%', maxWidth: 520, alignSelf: 'center' },
});
