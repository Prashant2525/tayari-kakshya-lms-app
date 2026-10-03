import { radius } from '@tk/design-tokens';
import { Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useTargetPosts } from '@/api/queries';
import { CatalogList, MyCourses } from '@/features/courses/my-courses';
import { useT } from '@/i18n/use-t';
import { fontFamilies, useTheme } from '@/theme/theme';
import { Screen } from '@/ui/layout';
import { Segmented } from '@/ui/segmented';
import { Text } from '@/ui/text';

/** Courses tab: my courses with progress, then the catalog for my exam (or all), with search. */
export default function CoursesScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const targets = useTargetPosts();
  const target = targets.data?.[0] ?? null;
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');

  // Search after a short pause in typing, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setQ(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        <Text variant="h1" role="heading">
          {t('courses.title')}
        </Text>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Search size={20} color={colors.textMuted} strokeWidth={1.75} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('courses.search')}
            placeholderTextColor={colors.textMuted}
            aria-label={t('courses.search')}
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.text }]}
          />
        </View>
        {q ? null : (
          <View style={{ gap: 10 }}>
            <MyCourses hideWhenEmpty />
          </View>
        )}
        <Text variant="h3" role="heading">
          {target && scope === 'mine' ? t('courses.browse') : t('courses.all')}
        </Text>
        {target ? (
          <Segmented
            label={t('courses.title')}
            value={scope}
            options={[
              { value: 'mine', label: t('courses.browse') },
              { value: 'all', label: t('courses.all') },
            ]}
            onChange={setScope}
          />
        ) : null}
        <CatalogList examNodeId={target && scope === 'mine' ? target.id : null} q={q} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 0 },
  list: { padding: 20, gap: 14, flexGrow: 1, width: '100%', maxWidth: 640, alignSelf: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontFamily: fontFamilies[400], fontSize: 16, minHeight: 44 },
});
