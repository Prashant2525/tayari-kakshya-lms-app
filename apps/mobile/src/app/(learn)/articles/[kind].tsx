import type { ArticleKind, ArticlePeriod } from '@tk/contracts';
import { useLocalSearchParams } from 'expo-router';
import { Newspaper } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useArticleCategories, useArticles } from '@/api/articles';
import { ARTICLE_KIND_KEY, ARTICLE_PERIOD_KEY, ArticleCard } from '@/features/articles/article-card';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { FilterPills } from '@/ui/filter-pills';
import { BackButton, Screen, Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

const KINDS: ArticleKind[] = ['current_affairs', 'gorkhapatra', 'news', 'blog'];
const PERIODS: ArticlePeriod[] = ['daily', 'weekly', 'monthly', 'yearly'];

/** Articles of one kind, newest first; current affairs can be narrowed by period, and any kind by category. */
export default function ArticlesScreen() {
  const params = useLocalSearchParams<{ kind: string }>();
  const kind = (KINDS.includes(params.kind as ArticleKind) ? params.kind : 'news') as ArticleKind;
  const { t, locale } = useT();
  const [period, setPeriod] = useState<ArticlePeriod | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const categories = useArticleCategories(kind);
  const list = useArticles({
    kind,
    ...(period ? { period } : {}),
    ...(categoryId ? { categoryId } : {}),
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h2" role="heading">
          {t(ARTICLE_KIND_KEY[kind])}
        </Text>
      </View>
      {kind === 'current_affairs' ? (
        <FilterPills
          label={t('articles.periodFilter')}
          value={period}
          options={[
            { value: null, label: t('articles.all') },
            ...PERIODS.map((p) => ({ value: p, label: t(ARTICLE_PERIOD_KEY[p]) })),
          ]}
          onChange={setPeriod}
        />
      ) : null}
      {categories.data && categories.data.length > 0 ? (
        <FilterPills
          label={t('articles.categoryFilter')}
          value={categoryId}
          options={[
            { value: null, label: t('articles.allCategories') },
            ...categories.data.map((c) => ({
              value: c.id as string | null,
              label: localized(c.name, locale),
            })),
          ]}
          onChange={setCategoryId}
        />
      ) : null}
      {list.isPending ? (
        <View style={{ gap: 10 }} aria-busy>
          <Skeleton height={112} />
          <Skeleton height={112} />
        </View>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Newspaper} title={t('articles.empty')} body={t('articles.emptyBody')} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
          renderItem={({ item }) => <ArticleCard article={item} />}
          onEndReached={() => list.hasNextPage && void list.fetchNextPage()}
          refreshControl={
            <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
