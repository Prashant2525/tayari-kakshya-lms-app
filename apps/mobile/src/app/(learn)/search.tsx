import { radius } from '@tk/design-tokens';
import { Search } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSearch } from '@/api/learning';
import { CourseRow } from '@/features/courses/course-card';
import { ResultRow } from '@/features/practice/result-rows';
import { ArticleSearchRow } from '@/features/articles/article-card';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { track } from '@/lib/analytics';
import { fontFamilies, useTheme } from '@/theme/theme';
import { BackButton, Screen, Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';
import { noFocusRing } from '@/ui/text-field';

/** Unified search: courses, lessons and practice questions (both languages). */
export default function SearchScreen() {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setQ(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);
  const results = useSearch(q);
  const data = results.data;
  const empty =
    data && !data.courses.length && !data.items.length && !data.questions.length && !data.articles.length;

  // Counted once per search; the search text itself is never sent (it can contain anything).
  const tracked = useRef<string | null>(null);
  useEffect(() => {
    if (!data || tracked.current === q) return;
    tracked.current = q;
    track('search_performed', { results: data.courses.length + data.items.length + data.questions.length });
  }, [data, q]);

  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <View
          style={[
            styles.search,
            {
              backgroundColor: colors.surface,
              borderColor: focused ? colors.primary : colors.border,
              borderWidth: focused ? 2 : 1,
            },
          ]}
        >
          <Search size={20} color={colors.textMuted} strokeWidth={1.75} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('search.placeholder')}
            placeholderTextColor={colors.textMuted}
            aria-label={t('search.title')}
            autoFocus
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            returnKeyType="search"
            style={[styles.input, noFocusRing, { color: colors.text }]}
          />
        </View>
      </View>
      {q.length < 2 ? (
        <Text variant="bodySm" color="textMuted">
          {t('search.hint')}
        </Text>
      ) : results.isPending ? (
        <View style={{ gap: 10 }} aria-busy>
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : results.isError ? (
        <ErrorState error={results.error} onRetry={() => void results.refetch()} />
      ) : empty ? (
        <EmptyState icon={Search} title={t('search.none', { q })} />
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {data!.courses.length ? (
            <Section title={t('search.courses')}>
              {data!.courses.map((c) => (
                <CourseRow key={c.id} course={c} />
              ))}
            </Section>
          ) : null}
          {data!.items.length ? (
            <Section title={t('search.lessons')}>
              {data!.items.map((i) => (
                <ResultRow
                  key={i.id}
                  kind={i.type}
                  id={i.id}
                  title={localized(i.title, locale)}
                  subtitle={localized(i.subject.name, locale)}
                  premiumLabel={i.accessLevel === 'premium' ? t('item.premium') : undefined}
                />
              ))}
            </Section>
          ) : null}
          {data!.questions.length ? (
            <Section title={t('search.questions')}>
              {data!.questions.map((x) => (
                <ResultRow
                  key={x.id}
                  kind="question"
                  id={x.id}
                  title={x.preview}
                  subtitle={localized(x.subject.name, locale)}
                  premiumLabel={x.accessLevel === 'premium' ? t('item.premium') : undefined}
                />
              ))}
            </Section>
          ) : null}
          {data!.articles.length ? (
            <Section title={t('search.articles')}>
              {data!.articles.map((a) => (
                <ArticleSearchRow key={a.id} article={a} />
              ))}
            </Section>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="h4" role="heading">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  input: { flex: 1, fontFamily: fontFamilies[400], fontSize: 16, minHeight: 44 },
  list: { gap: 18, paddingBottom: 24 },
});
