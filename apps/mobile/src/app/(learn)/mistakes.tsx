import { radius } from '@tk/design-tokens';
import { NotebookPen } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useMistakes, useMistakesSummary } from '@/api/mistakes';
import { RevisionCard } from '@/features/practice/revision-card';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { num } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { BackButton, Screen, Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/**
 * Profile → Mistake notebook (D-050): wrong and partly correct answers from tests and practice, revised here until
 * answered correctly N times in a row (CMS setting), newest mistakes first, optionally one subject at a time.
 */
export default function MistakesScreen() {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const summary = useMistakesSummary();
  const list = useMistakes(subjectId);
  const entries = list.data?.pages.flatMap((p) => p.data) ?? [];
  const media = Object.assign({}, ...(list.data?.pages.map((p) => p.media) ?? []));
  const required = list.data?.pages[0]?.required ?? summary.data?.required ?? 2;
  const subjects = summary.data?.subjects ?? [];

  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('mistakes.title')}
        </Text>
      </View>
      {summary.data ? (
        <View style={{ gap: 4 }}>
          <Text variant="label">
            {t('mistakes.counts', {
              active: num(summary.data.active, locale),
              mastered: num(summary.data.mastered, locale),
            })}
          </Text>
          <Text variant="bodySm" color="textSecondary">
            {t('mistakes.rule', { required: num(required, locale) })}
          </Text>
        </View>
      ) : null}

      {subjects.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <View role="radiogroup" aria-label={t('mistakes.filter')} style={styles.filters}>
            {[
              { id: null, label: t('mistakes.allSubjects') },
              ...subjects.map((s) => ({
                id: s.id as string | null,
                label: `${localized(s.name, locale)} (${num(s.count, locale)})`,
              })),
            ].map((f) => {
              const selected = f.id === subjectId;
              return (
                <Pressable
                  key={f.id ?? 'all'}
                  role="radio"
                  aria-checked={selected}
                  onPress={() => setSubjectId(f.id)}
                  style={[
                    styles.filter,
                    {
                      backgroundColor: selected ? colors.primarySoft : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text variant="bodySm" color={selected ? 'onPrimarySoft' : 'text'}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : null}

      {list.isPending ? (
        <View style={{ gap: 10 }} aria-busy>
          <Skeleton height={160} />
          <Skeleton height={160} />
        </View>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState icon={NotebookPen} title={t('mistakes.empty')} body={t('mistakes.emptyBody')} />
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {entries.map((e, i) => (
            <RevisionCard key={e.questionId} entry={e} number={i + 1} required={required} media={media} />
          ))}
          {list.hasNextPage ? (
            <Button
              label={t('practice.loadMore')}
              variant="secondary"
              size="md"
              loading={list.isFetchingNextPage}
              onPress={() => void list.fetchNextPage()}
            />
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  filters: { flexDirection: 'row', gap: 8 },
  filter: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  list: { gap: 12, paddingBottom: 24 },
});
