import { radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { ChartNoAxesColumn, ChevronRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useProgress } from '@/api/progress';
import { useT } from '@/i18n/use-t';
import { num } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { useSurfaceStyle } from '@/ui/layout';
import { PressableScale } from '@/ui/motion';
import { Text } from '@/ui/text';
import { studyDuration } from './duration';

/** Home: this week's study time and accuracy, opening My progress. */
export function ProgressLink() {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const surface = useSurfaceStyle();
  const progress = useProgress();
  const p = progress.data;
  const time = p ? studyDuration(p.studyTime.weekSeconds, t, locale) : null;
  const body = !time
    ? undefined
    : p?.accuracy.accuracy != null
      ? t('progress.homeBody', { time, percent: num(p.accuracy.accuracy, locale) })
      : t('progress.homeBodyTime', { time });
  return (
    <PressableScale
      role="link"
      aria-label={t('progress.title')}
      onPress={() => router.push('/progress')}
      style={[styles.row, surface]}
    >
      <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
        <ChartNoAxesColumn size={22} color={colors.onPrimarySoft} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="h4">{t('progress.title')}</Text>
        {body ? (
          <Text variant="bodySm" color="textSecondary">
            {body}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
