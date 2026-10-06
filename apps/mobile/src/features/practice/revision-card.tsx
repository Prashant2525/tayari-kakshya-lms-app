import { radius } from '@tk/design-tokens';
import type { Outcome } from '@tk/domain';
import { Lock } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MediaMap } from '@/api/learning';
import { useRemoveMistake, useReviewMistake, type MistakeEntry, type ReviewResult } from '@/api/mistakes';
import { RichText } from '@/features/learn/rich-text';
import { AnswerInput, docFor, EMPTY_DRAFT, toResponse, type Draft } from '@/features/questions/answer-input';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { errorMessageKey } from '@/lib/error-message';
import { num } from '@/lib/format';
import { markBlanks } from '@/lib/practice';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { StatusChip } from '@/ui/chip';
import { Banner, Card } from '@/ui/layout';
import { Text } from '@/ui/text';
import { OutcomeBanner, Solution } from './question-card';

/**
 * One question in revision mode (D-050): the answer is checked by the API, which counts correct answers in a row;
 * at the CMS number the question is mastered and leaves the notebook. Written answers are self-reviewed against
 * the model answer. The student can also remove the question.
 */
export function RevisionCard({
  entry,
  number,
  required,
  media,
}: {
  entry: MistakeEntry;
  number: number;
  required: number;
  media: MediaMap;
}) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const q = entry.question;
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [skipped, setSkipped] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [showModel, setShowModel] = useState(false);
  const review = useReviewMistake(entry.questionId);
  const remove = useRemoveMistake(entry.questionId);
  const streak = result?.correctStreak ?? entry.correctStreak;
  const stem = docFor(q.question.stem, locale);
  const done = (r: ReviewResult) => setResult(r);

  const check = () => {
    const response = toResponse(q.question, draft);
    setSkipped(!response);
    if (response) review.mutate({ response }, { onSuccess: done });
  };
  const again = () => {
    setDraft(EMPTY_DRAFT);
    setResult(null);
    setShowModel(false);
    review.reset();
  };

  return (
    <Card style={{ gap: 12 }}>
      <View role="group" aria-label={t('practice.number', { n: number })} style={{ gap: 12 }}>
        <View style={styles.head}>
          <Text variant="label" color="textMuted">
            {t('practice.number', { n: number })}
          </Text>
          <StatusChip
            tone="neutral"
            label={entry.lastSource === 'test' ? t('mistakes.fromTest') : t('mistakes.fromPractice')}
          />
          <Text variant="caption" color="textMuted" style={{ flex: 1, textAlign: 'right' }}>
            {localized(entry.subject.name, locale)}
          </Text>
        </View>

        {q.passage && docFor(q.passage.content, locale) ? (
          <View style={[styles.passage, { backgroundColor: colors.surfaceMuted }]}>
            <RichText doc={docFor(q.passage.content, locale)!} media={media} scale={0.94} />
          </View>
        ) : null}
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

        {q.locked || !q.answer ? (
          <View style={[styles.locked, { borderColor: colors.borderStrong }]}>
            <Lock size={18} color={colors.warning} strokeWidth={1.75} />
            <Text variant="bodySm" color="textSecondary" style={{ flex: 1 }}>
              {t('mistakes.locked')}
            </Text>
          </View>
        ) : result?.mastered ? (
          <>
            <OutcomeBanner outcome="correct" />
            <Banner tone="success" message={t('mistakes.mastered')} />
          </>
        ) : (
          <>
            <AnswerInput
              body={q.question}
              draft={draft}
              onChange={setDraft}
              review={result ? q.answer : null}
              media={media}
            />
            {q.question.type === 'subjective' ? (
              <SelfReview
                entry={entry}
                media={media}
                open={showModel}
                onOpen={() => setShowModel(true)}
                answered={result !== null}
                busy={review.isPending}
                onAnswer={(selfCorrect) => review.mutate({ selfCorrect }, { onSuccess: done })}
              />
            ) : null}
            {q.question.type === 'subjective' && result ? (
              <>
                <OutcomeBanner outcome={result.outcome as Outcome} />
                <Button label={t('practice.tryAgain')} variant="secondary" size="md" onPress={again} />
              </>
            ) : null}
            {q.question.type !== 'subjective' ? (
              <>
                {skipped ? <Banner tone="info" message={t('practice.skipped')} /> : null}
                {result ? <OutcomeBanner outcome={result.outcome as Outcome} /> : null}
                {result ? <Solution q={q} media={media} /> : null}
                <Button
                  label={result ? t('practice.tryAgain') : t('practice.check')}
                  variant={result ? 'secondary' : 'primary'}
                  size="md"
                  loading={review.isPending}
                  onPress={result ? again : check}
                />
              </>
            ) : null}
            {review.error ? <Banner message={t(errorMessageKey(review.error))} /> : null}
            <Text variant="caption" color="textSecondary">
              {t('mistakes.streak', { n: num(streak, locale), required: num(required, locale) })}
            </Text>
          </>
        )}

        {!result?.mastered ? (
          <Button
            label={t('mistakes.remove')}
            variant="tertiary"
            size="md"
            loading={remove.isPending}
            onPress={() => remove.mutate()}
          />
        ) : null}
      </View>
    </Card>
  );
}

function SelfReview({
  entry,
  media,
  open,
  onOpen,
  answered,
  busy,
  onAnswer,
}: {
  entry: MistakeEntry;
  media: MediaMap;
  open: boolean;
  onOpen: () => void;
  answered: boolean;
  busy: boolean;
  onAnswer: (selfCorrect: boolean) => void;
}) {
  const { t, locale } = useT();
  const a = entry.question.answer;
  if (!a || a.type !== 'subjective') return null;
  const model = docFor(a.modelAnswer, locale);
  if (!open) {
    return (
      <Button
        label={t('practice.showAnswer')}
        variant="secondary"
        size="md"
        onPress={onOpen}
        style={{ alignSelf: 'flex-start' }}
      />
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {model ? (
        <View style={{ gap: 4 }}>
          <Text variant="caption" color="success" style={styles.overline}>
            {t('practice.modelAnswer')}
          </Text>
          <RichText doc={model} media={media} scale={0.94} />
        </View>
      ) : null}
      {answered ? null : (
        <>
          <Text variant="label">{t('mistakes.selfQuestion')}</Text>
          <View style={styles.row}>
            <Button
              label={t('mistakes.selfRight')}
              size="md"
              loading={busy}
              onPress={() => onAnswer(true)}
              style={{ flex: 1 }}
            />
            <Button
              label={t('mistakes.selfWrong')}
              variant="secondary"
              size="md"
              disabled={busy}
              onPress={() => onAnswer(false)}
              style={{ flex: 1 }}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  passage: { borderRadius: radius.md, padding: 12 },
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
  },
  row: { flexDirection: 'row', gap: 10 },
  overline: { textTransform: 'uppercase', letterSpacing: 0.4 },
});
