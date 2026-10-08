import { radius } from '@tk/design-tokens';
import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { ExternalLink } from 'lucide-react-native';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { articleDate, coverUri, useArticle } from '@/api/articles';
import { ARTICLE_KIND_KEY, ARTICLE_PERIOD_KEY } from '@/features/articles/article-card';
import { RichText } from '@/features/learn/rich-text';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDate } from '@/lib/dates';
import { useStudyTime } from '@/lib/study-time';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { StatusChip } from '@/ui/chip';
import { BackButton, Screen, Skeleton } from '@/ui/layout';
import { ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** One article as written in the CMS: picture, date, source, text, and a practice quiz when there is one. */
export default function ArticleScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, locale } = useT();
  const { colors } = useTheme();
  const article = useArticle(slug);
  useStudyTime('reading');
  const a = article.data;
  const doc = a ? (a.body[locale] ?? a.body.en ?? a.body.ne) : undefined;
  const cover = a ? coverUri(a.cover, 1280) : null;
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
      </View>
      {article.isPending ? (
        <Skeleton height={320} />
      ) : article.isError ? (
        <ErrorState error={article.error} onRetry={() => void article.refetch()} />
      ) : a ? (
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
          {cover ? (
            <Image
              source={{ uri: cover }}
              style={styles.cover}
              accessibilityIgnoresInvertColors
              resizeMode="cover"
            />
          ) : null}
          <View style={styles.meta}>
            <StatusChip tone="neutral" label={t(ARTICLE_KIND_KEY[a.kind])} />
            {a.period ? <StatusChip tone="neutral" label={t(ARTICLE_PERIOD_KEY[a.period])} /> : null}
            {a.category ? <StatusChip tone="neutral" label={localized(a.category.name, locale)} /> : null}
          </View>
          <Text variant="h2" role="heading">
            {localized(a.title, locale)}
          </Text>
          <Text variant="caption" color="textMuted">
            {bsDate(articleDate(a), locale)}
          </Text>
          {doc ? <RichText doc={doc} media={a.media} /> : null}
          {a.sourceUrl ? (
            <Pressable
              role="link"
              onPress={() => void WebBrowser.openBrowserAsync(a.sourceUrl!)}
              style={[styles.source, { borderColor: colors.border }]}
            >
              <ExternalLink size={18} color={colors.link} strokeWidth={1.75} />
              <Text variant="bodySm" color="link" style={{ flex: 1 }}>
                {t('articles.source', { name: a.sourceName ?? new URL(a.sourceUrl).hostname })}
              </Text>
            </Pressable>
          ) : a.sourceName ? (
            <Text variant="bodySm" color="textSecondary">
              {t('articles.sourceText', { name: a.sourceName })}
            </Text>
          ) : null}
          {a.quiz ? (
            <View style={[styles.quiz, { backgroundColor: colors.primarySoft }]}>
              <Text variant="body" weight={600}>
                {t('articles.quizTitle')}
              </Text>
              <Text variant="bodySm">{localized(a.quiz.title, locale)}</Text>
              <Button
                label={t('articles.takeQuiz')}
                size="md"
                onPress={() => router.push({ pathname: '/test/[id]', params: { id: a.quiz!.id } })}
              />
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center' },
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
  },
  quiz: { gap: 8, borderRadius: radius.md, padding: 14, alignItems: 'flex-start' },
});
