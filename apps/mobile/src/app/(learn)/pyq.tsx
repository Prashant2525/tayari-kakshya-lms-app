import { History } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { usePyq, usePyqFilters, type PyqChoice } from '@/api/learning';
import { QuestionCard } from '@/features/practice/question-card';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { num } from '@/lib/format';
import { Button } from '@/ui/button';
import { BackButton, Screen, Skeleton } from '@/ui/layout';
import { SelectField } from '@/ui/select';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

const ALL = '';

/**
 * Previous-year questions (D-020, D-074 / audit F-10): browse by exam category (and everything under it), paper and
 * year (BS). Answers follow the practice rules — premium ones stay locked without access to the course.
 */
export default function PyqScreen() {
  const { t, locale } = useT();
  const filters = usePyqFilters();
  const [choice, setChoice] = useState<PyqChoice>({ examNodeId: null, paperId: null, yearBs: null });
  const list = usePyq(choice);
  const questions = list.data?.pages.flatMap((p) => p.data) ?? [];
  const media = Object.assign({}, ...(list.data?.pages.map((p) => p.media) ?? []));
  const f = filters.data;
  const all = { value: ALL, label: t('pyq.all') };

  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('pyq.title')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {f ? (
          <View style={{ gap: 10 }}>
            <SelectField
              label={t('pyq.exam')}
              value={choice.examNodeId ?? ALL}
              placeholder={t('pyq.all')}
              options={[all, ...f.examNodes.map((n) => ({ value: n.id, label: localized(n.name, locale) }))]}
              onChange={(v) => setChoice((c) => ({ ...c, examNodeId: v || null }))}
            />
            <View style={styles.row}>
              <SelectField
                compact
                label={t('pyq.paper')}
                value={choice.paperId ?? ALL}
                placeholder={t('pyq.all')}
                options={[all, ...f.papers.map((p) => ({ value: p.id, label: localized(p.name, locale) }))]}
                onChange={(v) => setChoice((c) => ({ ...c, paperId: v || null }))}
              />
              <SelectField
                compact
                label={t('pyq.year')}
                value={choice.yearBs ? String(choice.yearBs) : ALL}
                placeholder={t('pyq.all')}
                options={[all, ...f.years.map((y) => ({ value: String(y), label: num(y, locale) }))]}
                onChange={(v) => setChoice((c) => ({ ...c, yearBs: v ? Number(v) : null }))}
              />
            </View>
          </View>
        ) : null}
        {list.isPending ? (
          <View style={{ gap: 10 }} aria-busy>
            <Skeleton height={140} />
            <Skeleton height={140} />
          </View>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : questions.length === 0 ? (
          <EmptyState icon={History} title={t('pyq.empty')} body={t('pyq.emptyBody')} />
        ) : (
          <>
            {questions.map((q, i) => (
              <QuestionCard key={q.id} q={q} number={i + 1} media={media} />
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
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 8, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  row: { flexDirection: 'row', gap: 10 },
  list: { gap: 14, paddingBottom: 32 },
});
