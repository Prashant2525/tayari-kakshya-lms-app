import { HelpCircle } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { usePracticeQuestions } from '@/api/learning';
import { useT } from '@/i18n/use-t';
import { Button } from '@/ui/button';
import { Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { QuestionCard } from './question-card';

/** Subject → Questions tab: the subject's published practice questions, 20 at a time. */
export function PracticeList({
  courseId,
  subjectId,
  courseSlug,
}: {
  courseId: string;
  subjectId: string;
  courseSlug?: string;
}) {
  const { t } = useT();
  const list = usePracticeQuestions(courseId, subjectId);
  if (list.isPending) {
    return (
      <View style={{ gap: 10, marginTop: 14 }} aria-busy>
        <Skeleton height={140} />
        <Skeleton height={140} />
      </View>
    );
  }
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  const questions = list.data.pages.flatMap((p) => p.data);
  const media = Object.assign({}, ...list.data.pages.map((p) => p.media));
  if (questions.length === 0) {
    return <EmptyState icon={HelpCircle} title={t('practice.empty')} body={t('practice.emptyBody')} />;
  }
  return (
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      {questions.map((q, i) => (
        <QuestionCard key={q.id} q={q} number={i + 1} media={media} courseSlug={courseSlug || undefined} />
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
  );
}

const styles = StyleSheet.create({ list: { gap: 12, paddingBottom: 24 } });
