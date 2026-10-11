import { radius } from '@tk/design-tokens';
import type { Outcome } from '@tk/domain';
import { router } from 'expo-router';
import { ChevronDown, Flag, Lock } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { MediaMap, PracticeQuestion } from '@/api/learning';
import { useRecordPractice } from '@/api/mistakes';
import { RichText } from '@/features/learn/rich-text';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { track } from '@/lib/analytics';
import { markBlanks, practiceOutcome } from '@/lib/practice';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { StatusChip } from '@/ui/chip';
import { Banner, Card } from '@/ui/layout';
import { Text } from '@/ui/text';
import { AnswerInput, docFor, EMPTY_DRAFT, toResponse, type Draft } from '@/features/questions/answer-input';
import { BookmarkButton } from './bookmark-button';
import { ReportSheet } from './report-sheet';
import { DiscussLink } from './discuss-link';

/**
 * One practice question (DESIGN_SYSTEM §8 "Questions"): every question type, a check against the answer key the
 * API sent (only when unlocked), the explanation, and a locked card instead of the answer for Premium questions.
 */
export function QuestionCard({
  q,
  number,
  media,
  courseSlug,
}: {
  q: PracticeQuestion;
  number: number;
  media: MediaMap;
  courseSlug?: string;
}) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [outcome, setOutcome] = useState<Outcome | 'skipped' | null>(null);
  const [showPassage, setShowPassage] = useState(false);
  const [reporting, setReporting] = useState(false);
  const record = useRecordPractice(q.id);
  const checked = outcome !== null && outcome !== 'skipped';
  const body = q.question;
  const answer = q.answer;
  const stem = docFor(body.stem, locale);
  const year = q.sources.find((s) => s.yearBs)?.yearBs;

  const check = () => {
    if (!answer) return;
    const response = toResponse(q.question, draft);
    const result = response ? practiceOutcome(answer, response) : 'skipped';
    setOutcome(result);
    if (result !== 'skipped') {
      track('practice_answer_checked', { question_type: q.question.type, outcome: result });
      // Recorded and scored again on the server: mistakes go into the notebook (D-050).
      if (response) record.mutate(response);
    }
  };
  const reset = () => {
    setDraft(EMPTY_DRAFT);
    setOutcome(null);
    record.reset();
  };

  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.head}>
        <Text variant="label" color="textMuted">
          {t('practice.number', { n: number })}
        </Text>
        <StatusChip tone="neutral" label={t('practice.marks', { marks: q.marks })} />
        {q.isPyq && year ? <StatusChip tone="progress" label={t('practice.pyq', { year })} /> : null}
        <View style={{ flex: 1 }} />
        <BookmarkButton type="question" id={q.id} />
        <Pressable
          role="button"
          aria-label={t('report.title')}
          onPress={() => setReporting(true)}
          style={styles.icon}
          hitSlop={4}
        >
          <Flag size={20} color={colors.textSecondary} strokeWidth={1.75} />
        </Pressable>
      </View>

      {q.passage ? (
        <View style={[styles.passage, { backgroundColor: colors.surfaceMuted }]}>
          <Pressable
            role="button"
            aria-expanded={showPassage}
            onPress={() => setShowPassage((s) => !s)}
            style={styles.passageHead}
          >
            <Text variant="label" style={{ flex: 1 }}>
              {q.passage.title ? localized(q.passage.title, locale) : t('practice.passage')}
            </Text>
            <View style={{ transform: [{ rotate: showPassage ? '180deg' : '0deg' }] }}>
              <ChevronDown size={18} color={colors.textSecondary} strokeWidth={1.75} />
            </View>
          </Pressable>
          {showPassage && docFor(q.passage.content, locale) ? (
            <RichText doc={docFor(q.passage.content, locale)!} media={media} scale={0.94} />
          ) : null}
        </View>
      ) : null}

      {stem ? (
        <RichText
          doc={
            body.type === 'fill_blank'
              ? markBlanks(
                  stem,
                  body.blanks.map((b) => b.id),
                )
              : stem
          }
          media={media}
          scale={0.97}
        />
      ) : null}

      {q.locked || !answer ? (
        <View style={[styles.locked, { borderColor: colors.borderStrong, backgroundColor: colors.bg }]}>
          <View style={[styles.lockIcon, { backgroundColor: colors.warningSoft }]}>
            <Lock size={20} color={colors.warning} strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="label">{t('practice.lockedTitle')}</Text>
            <Text variant="bodySm" color="textSecondary">
              {t('practice.lockedBody')}
            </Text>
          </View>
          {courseSlug ? (
            <Button
              label={t('learn.seeCourse')}
              size="md"
              onPress={() => router.push({ pathname: '/course/[slug]', params: { slug: courseSlug } })}
            />
          ) : null}
        </View>
      ) : (
        <>
          <AnswerInput
            body={q.question}
            draft={draft}
            onChange={setDraft}
            review={checked ? q.answer : null}
            media={media}
          />
          {body.type === 'subjective' ? (
            <>
              <SubjectiveAnswer q={q} media={media} />
              <DiscussLink target="question" id={q.id} />
            </>
          ) : (
            <>
              {outcome === 'skipped' ? <Banner tone="info" message={t('practice.skipped')} /> : null}
              {checked ? <OutcomeBanner outcome={outcome} /> : null}
              {checked && record.data?.addedToNotebook ? (
                <Text variant="caption" color="textSecondary">
                  {t('mistakes.added')}
                </Text>
              ) : null}
              {checked ? <Solution q={q} media={media} /> : null}
              {checked ? <DiscussLink target="question" id={q.id} /> : null}
              <Button
                label={checked ? t('practice.tryAgain') : t('practice.check')}
                variant={checked ? 'secondary' : 'primary'}
                size="md"
                onPress={checked ? reset : check}
              />
            </>
          )}
        </>
      )}
      <ReportSheet questionId={q.id} visible={reporting} onClose={() => setReporting(false)} />
    </Card>
  );
}

export function OutcomeBanner({ outcome }: { outcome: Outcome | 'skipped' | null }) {
  const { t } = useT();
  if (outcome === 'correct') return <Banner tone="success" message={t('practice.correct')} />;
  if (outcome === 'partial') return <Banner tone="info" message={t('practice.partial')} />;
  return <Banner message={t('practice.wrong')} />;
}

/** The correct answer (choice questions show it on the options) and the explanation. */
export function Solution({ q, media }: { q: PracticeQuestion; media: MediaMap }) {
  const { t, locale } = useT();
  const a = q.answer!;
  let text: string | null = null;
  if (a.type === 'true_false') text = a.correct ? t('practice.true') : t('practice.false');
  if (a.type === 'numeric') {
    const unit =
      q.question.type === 'numeric' && q.question.unit ? ` ${localized(q.question.unit, locale)}` : '';
    text = `${a.value}${a.tolerance ? ` ± ${a.tolerance}` : ''}${unit}`;
  }
  if (a.type === 'fill_blank') text = a.blanks.map((b, i) => `(${i + 1}) ${b.accepted[0] ?? ''}`).join('   ');
  const explanation = docFor(a.explanation, locale);
  return (
    <View style={{ gap: 8 }}>
      {text ? (
        <Text variant="label" color="success">
          {t('practice.answerIs', { answer: text })}
        </Text>
      ) : null}
      {explanation ? (
        <View style={{ gap: 4 }}>
          <Text variant="caption" color="textMuted" style={styles.overline}>
            {t('practice.explanation')}
          </Text>
          <RichText doc={explanation} media={media} scale={0.94} />
        </View>
      ) : null}
    </View>
  );
}

function SubjectiveAnswer({ q, media }: { q: PracticeQuestion; media: MediaMap }) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const a = q.answer;
  if (!a || a.type !== 'subjective') return null;
  const model = docFor(a.modelAnswer, locale);
  const explanation = docFor(a.explanation, locale);
  return (
    <View style={{ gap: 10 }}>
      <Button
        label={open ? t('practice.hideAnswer') : t('practice.showAnswer')}
        variant="secondary"
        size="md"
        onPress={() => setOpen((o) => !o)}
        style={{ alignSelf: 'flex-start' }}
      />
      {open && model ? (
        <View style={{ gap: 4 }}>
          <Text variant="caption" color="success" style={styles.overline}>
            {t('practice.modelAnswer')}
          </Text>
          <RichText doc={model} media={media} scale={0.94} />
          {explanation ? <RichText doc={explanation} media={media} scale={0.94} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  passage: { borderRadius: radius.md, padding: 12, gap: 8 },
  passageHead: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    flexWrap: 'wrap',
  },
  lockIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overline: { textTransform: 'uppercase', letterSpacing: 0.4 },
});
