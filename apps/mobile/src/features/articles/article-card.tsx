import { radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { Newspaper } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { articleDate, coverUri, type ArticleCard as Card } from '@/api/articles';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import type { MessageKey } from '@/i18n/en';
import { bsDate } from '@/lib/dates';
import { useTheme } from '@/theme/theme';
import { Text } from '@/ui/text';

export const ARTICLE_KIND_KEY: Record<Card['kind'], MessageKey> = {
  current_affairs: 'articles.kind.current_affairs',
  gorkhapatra: 'articles.kind.gorkhapatra',
  news: 'articles.kind.news',
  blog: 'articles.kind.blog',
};

export const ARTICLE_PERIOD_KEY: Record<NonNullable<Card['period']>, MessageKey> = {
  daily: 'articles.period.daily',
  weekly: 'articles.period.weekly',
  monthly: 'articles.period.monthly',
  yearly: 'articles.period.yearly',
};

/** One article in a list: picture, what it is, the date, title and summary. */
export function ArticleCard({ article: a }: { article: Card }) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const title = localized(a.title, locale);
  const uri = coverUri(a.cover, 320);
  const meta = [
    a.period ? t(ARTICLE_PERIOD_KEY[a.period]) : null,
    a.category ? localized(a.category.name, locale) : null,
    bsDate(articleDate(a), locale),
  ].filter(Boolean);
  return (
    <Pressable
      role="link"
      aria-label={title}
      onPress={() => router.push({ pathname: '/article/[slug]', params: { slug: a.slug } })}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {meta.join(' · ')}
        </Text>
        <Text variant="h4" numberOfLines={3}>
          {title}
        </Text>
        <Text variant="bodySm" color="textSecondary" numberOfLines={2}>
          {localized(a.summary, locale)}
        </Text>
      </View>
      {uri ? (
        <Image source={{ uri }} style={styles.thumb} accessibilityIgnoresInvertColors resizeMode="cover" />
      ) : null}
    </Pressable>
  );
}

/** An article in search results: icon, title, kind and date. */
export function ArticleSearchRow({
  article: a,
}: {
  article: Pick<Card, 'kind' | 'slug' | 'title' | 'period' | 'periodDate' | 'publishedAt'>;
}) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const title = localized(a.title, locale);
  return (
    <Pressable
      role="link"
      aria-label={title}
      onPress={() => router.push({ pathname: '/article/[slug]', params: { slug: a.slug } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surfaceMuted : colors.surface, borderColor: colors.border },
      ]}
    >
      <Newspaper size={20} color={colors.onPrimarySoft} strokeWidth={1.75} />
      <View style={{ flex: 1 }}>
        <Text variant="body" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="caption" color="textMuted">
          {[t(ARTICLE_KIND_KEY[a.kind]), bsDate(articleDate(a), locale)].join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  card: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: radius.md, padding: 14 },
  thumb: { width: 84, height: 84, borderRadius: radius.sm },
});
