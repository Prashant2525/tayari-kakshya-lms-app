import { radius } from '@tk/design-tokens';
import type { ArticleKind } from '@tk/contracts';
import { router } from 'expo-router';
import { Globe, Newspaper, ScrollText, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n/use-t';
import { useTheme } from '@/theme/theme';
import { useSurfaceStyle } from '@/ui/layout';
import { PressableScale } from '@/ui/motion';
import { Text } from '@/ui/text';
import { ARTICLE_KIND_KEY } from './article-card';

const TILES: Array<{ kind: ArticleKind; icon: LucideIcon }> = [
  { kind: 'current_affairs', icon: Globe },
  { kind: 'gorkhapatra', icon: ScrollText },
  { kind: 'news', icon: Newspaper },
];

/** Home: current affairs, Gorkhapatra summaries and news (the blog is in Profile). */
export function ReadTiles() {
  const { colors } = useTheme();
  const surface = useSurfaceStyle();
  const { t } = useT();
  return (
    <View style={{ gap: 10 }}>
      <Text variant="h3" role="heading">
        {t('articles.read')}
      </Text>
      <View style={styles.row}>
        {TILES.map(({ kind, icon: Icon }) => (
          <PressableScale
            key={kind}
            role="link"
            onPress={() => router.push({ pathname: '/articles/[kind]', params: { kind } })}
            style={[styles.tile, surface]}
            pressedScale={0.95}
          >
            <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
              <Icon size={22} color={colors.onPrimarySoft} strokeWidth={1.75} />
            </View>
            <Text variant="label" align="center" numberOfLines={2}>
              {t(ARTICLE_KIND_KEY[kind])}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 6,
  },
  icon: { width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
});
