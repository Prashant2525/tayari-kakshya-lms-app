import { radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { Pin } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import type { NoticeRow } from '@/api/notices';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDate } from '@/lib/dates';
import { useTheme } from '@/theme/theme';
import { StatusChip } from '@/ui/chip';
import { useSurfaceStyle } from '@/ui/layout';
import { PressableScale } from '@/ui/motion';
import { Text } from '@/ui/text';
import { KIND_KEY } from './kinds';

/** One notice in a list (Notice tab, Home). */
export function NoticeCard({ n, lines = 3 }: { n: NoticeRow; lines?: number }) {
  const { colors } = useTheme();
  const surface = useSurfaceStyle();
  const { t, locale } = useT();
  const title = localized(n.title, locale);
  return (
    <PressableScale
      role="link"
      aria-label={title}
      onPress={() => router.push({ pathname: '/notice/[id]', params: { id: n.id } })}
      style={[styles.card, surface]}
    >
      <View style={styles.meta}>
        <StatusChip tone={n.kind === 'official' ? 'official' : 'neutral'} label={t(KIND_KEY[n.kind])} />
        {n.isPinned ? (
          <Pin size={16} color={colors.textSecondary} strokeWidth={1.75} aria-label={t('notices.pinned')} />
        ) : null}
        <Text variant="caption" color="textMuted" style={{ marginLeft: 'auto' }}>
          {bsDate(n.publishedAt, locale)}
        </Text>
      </View>
      <Text variant="h4">{title}</Text>
      <Text variant="bodySm" color="textSecondary" numberOfLines={lines}>
        {localized(n.summary, locale)}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
