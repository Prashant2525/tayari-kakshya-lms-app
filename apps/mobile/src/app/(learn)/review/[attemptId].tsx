import { radius } from '@tk/design-tokens';
import type { AnswerResponse } from '@tk/domain';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAttemptResult, useSelfGrade, type AttemptResult, type SolvedQuestion } from '@/api/assessments';
import { RichText } from '@/features/learn/rich-text';
import { AnswerInput, docFor, fromResponse } from '@/features/questions/answer-input';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { errorMessageKey } from '@/lib/error-message';
import { marks, num } from '@/lib/format';
import { markBlanks } from '@/lib/practice';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { StatusChip, type ChipTone } from '@/ui/chip';
import { BackButton, Banner, Card, Screen, Skeleton } from '@/ui/layout';
import { ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

/** Every question with the student's answer, the correct answer and (when the CMS allows) the explanation. */
export default function ReviewScreen() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const { t } = useT();
  const result = useAttemptResult(attemptId);
  return (
    <Screen edges={['top', 'bottom']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('review.title')}
        </Text>
      </View>
      {result.isPending ? (
        <View style={{ gap: 12 }} aria-busy>
          <Skeleton height={180} />
          <Skeleton height={180} />
        </View>
      ) : result.isError ? (
        <ErrorState error={result.error} onRetry={() => void result.refetch()} />
      ) : (
        <Review r={result.data} />
      )}
    </Screen>
  );
}

function Review({ r }: { r: AttemptResult }) {
  const { t, locale } = useT();
  const selfGrade = useSelfGrade(r.id);
  const [given, setGiven] = useState<Record<string, string>>({});
  const toGrade = r.canSelfGrade ? r.questions.filter((q) => q.outcome === 'pending') : [];
  const save = () => {
    const grades = toGrade.flatMap((q) => {
      const v = Number(
        (given[q.questionId] ?? '').replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966)),
      );
      return given[q.questionId]?.trim() && Number.isFinite(v)
        ? [{ questionId: q.questionId, awarded: v }]
        : [];
    });
    if (grades.length) selfGrade.mutate(grades);
  };
  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {r.canSelfGrade ? <Banner tone="info" message={t('result.selfGradeBody')} /> : null}
      {r.questions.map((q) => (
        <Solved
          key={q.questionId}
          q={q}
          media={r.media}
          grade={
            r.canSelfGrade && q.outcome === 'pending'
              ? {
                  value: given[q.questionId] ?? '',
                  set: (v) => setGiven((g) => ({ ...g, [q.questionId]: v })),
                }
              : null
          }
        />
      ))}
      {toGrade.length ? (
        <>
          {selfGrade.isError ? <Banner message={t(errorMessageKey(selfGrade.error))} /> : null}
          <Button label={t('review.saveMarks')} loading={selfGrade.isPending} onPress={save} />
        </>
      ) : null}
      <Text variant="caption" color="textMuted" align="center">
        {localized(r.assessment.title, locale)}
      </Text>
    </ScrollView>
  );
}

const OUTCOME_TONE: Record<string, ChipTone> = {
  correct: 'done',
  partial: 'progress',
  wrong: 'neutral',
  skipped: 'neutral',
  pending: 'progress',
};

function Solved({
  q,
  media,
  grade,
}: {
  q: SolvedQuestion;
  media: AttemptResult['media'];
  grade: { value: string; set: (v: string) => void } | null;
}) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const stem = docFor(q.question.stem, locale);
  const a = q.answer;
  const explanation = a ? docFor(a.explanation, locale) : null;
  const model = a?.type === 'subjective' ? docFor(a.modelAnswer, locale) : null;
  const draft = fromResponse(q.response as AnswerResponse | null);
  const outcomeLabel = q.outcome ? t(`result.${q.outcome}`) : t('review.notAnswered');
  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.head}>
        <Text variant="label" color="textMuted" style={{ flex: 1 }}>
          {t('practice.number', { n: num(q.number, locale) })}
        </Text>
        <StatusChip tone={OUTCOME_TONE[q.outcome ?? 'skipped'] ?? 'neutral'} label={outcomeLabel} />
        {q.awarded !== null ? (
          <Text variant="label" style={{ color: q.awarded < 0 ? colors.danger : colors.text }}>
            {t('review.awarded', { marks: marks(q.awarded, locale) })}
          </Text>
        ) : null}
      </View>
      {stem ? (
        <RichText
          doc={
            q.question.type === 'fill_blank'
              ? markBlanks(
                  stem,
                  q.question.blanks.map((b) => b.id),
                )
              : stem
          }
          media={media}
          scale={0.97}
        />
      ) : null}
      {q.question.type === 'subjective' ? (
        <View style={{ gap: 6 }}>
          <Text variant="caption" color="textMuted" style={styles.overline}>
            {t('exam.writtenAnswer')}
          </Text>
          <View style={[styles.written, { backgroundColor: colors.surfaceMuted }]}>
            <Text variant="body">{draft.text || t('review.notAnswered')}</Text>
          </View>
          {model ? (
            <>
              <Text variant="caption" color="success" style={styles.overline}>
                {t('practice.modelAnswer')}
              </Text>
              <RichText doc={model} media={media} scale={0.94} />
            </>
          ) : null}
        </View>
      ) : (
        <AnswerInput body={q.question} draft={draft} onChange={() => undefined} review={a} media={media} />
      )}
      {a && a.type === 'fill_blank' ? (
        <Text variant="label" color="success">
          {t('practice.answerIs', {
            answer: a.blanks.map((b, i) => `(${i + 1}) ${b.accepted[0] ?? ''}`).join('   '),
          })}
        </Text>
      ) : null}
      {a && a.type === 'numeric' ? (
        <Text variant="label" color="success">
          {t('practice.answerIs', { answer: `${a.value}${a.tolerance ? ` ± ${a.tolerance}` : ''}` })}
        </Text>
      ) : null}
      {q.graderComment ? (
        <View style={[styles.comment, { borderColor: colors.border }]}>
          <Text variant="caption" color="textMuted" style={styles.overline}>
            {t('review.teacherComment')}
          </Text>
          <Text variant="body">{q.graderComment}</Text>
        </View>
      ) : null}
      {explanation ? (
        <View style={{ gap: 4 }}>
          <Text variant="caption" color="textMuted" style={styles.overline}>
            {t('practice.explanation')}
          </Text>
          <RichText doc={explanation} media={media} scale={0.94} />
        </View>
      ) : null}
      {grade ? (
        <TextField
          label={t('review.give', { max: marks(q.marks, locale) })}
          value={grade.value}
          keyboardType="decimal-pad"
          onChangeText={grade.set}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  body: { gap: 14, paddingBottom: 24 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  overline: { textTransform: 'uppercase', letterSpacing: 0.4 },
  written: { borderRadius: radius.md, padding: 12 },
  comment: { borderWidth: 1, borderRadius: radius.md, padding: 12, gap: 4 },
});
