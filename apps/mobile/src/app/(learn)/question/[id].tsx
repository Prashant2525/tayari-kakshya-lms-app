import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { usePracticeQuestion } from '@/api/learning';
import { QuestionCard } from '@/features/practice/question-card';
import { useT } from '@/i18n/use-t';
import { BackButton, Screen, Skeleton } from '@/ui/layout';
import { ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** A single practice question, opened from Saved or Search. */
export default function QuestionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const question = usePracticeQuestion(id);
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('search.questions')}
        </Text>
      </View>
      {question.isPending ? (
        <Skeleton height={180} />
      ) : question.isError ? (
        <ErrorState error={question.error} onRetry={() => void question.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <QuestionCard q={question.data} number={1} media={question.data.media} />
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
