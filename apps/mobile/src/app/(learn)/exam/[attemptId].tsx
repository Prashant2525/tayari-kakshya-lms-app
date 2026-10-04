import { radius } from '@tk/design-tokens';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { ChevronDown, Clock, Flag, LayoutGrid, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  afterSubmit,
  submitAttempt,
  useAttempt,
  type AttemptQuestion,
  type AttemptView,
} from '@/api/assessments';
import { useExamAnswers, type Entry, type SaveState } from '@/features/exam/use-exam-answers';
import { RichText } from '@/features/learn/rich-text';
import { AnswerInput, docFor, toResponse } from '@/features/questions/answer-input';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { formatDuration, marks, num } from '@/lib/format';
import { markBlanks } from '@/lib/practice';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { Banner, Skeleton } from '@/ui/layout';
import { ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/**
 * Exam mode (DESIGN_SYSTEM §8, p19): full screen, sticky header with the timer and the question palette, one
 * question at a time, mark for review, confirm before submitting. The clock follows the server's deadline; when it
 * runs out the answers are sent and the attempt submitted (the server also does this on its own).
 */
export default function ExamScreen() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const attempt = useAttempt(attemptId);
  const { colors } = useTheme();

  if (attempt.isPending) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]}>
        <View style={{ padding: 20, gap: 12 }} aria-busy>
          <Skeleton height={48} />
          <Skeleton height={220} />
        </View>
      </SafeAreaView>
    );
  }
  if (attempt.isError) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]}>
        <ErrorState error={attempt.error} onRetry={() => void attempt.refetch()} />
      </SafeAreaView>
    );
  }
  return <Exam view={attempt.data} />;
}

type Flat = AttemptQuestion & { section: number };

function Exam({ view }: { view: AttemptView }) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const navigation = useNavigation();
  const questions = useMemo<Flat[]>(
    () => view.sections.flatMap((s, section) => s.questions.map((q) => ({ ...q, section }))),
    [view],
  );
  const [index, setIndex] = useState(0);
  const [palette, setPalette] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const toResult = useCallback(
    () => router.replace({ pathname: '/result/[attemptId]', params: { attemptId: view.id } }),
    [view.id],
  );
  const { entries, update, saveState, flushAll } = useExamAnswers(view, toResult);

  const finish = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(false);
    try {
      await flushAll();
      afterSubmit(await submitAttempt(view.id));
      toResult();
    } catch {
      // Offline: the answers stay on the phone; the server submits at the deadline anyway.
      setSubmitError(true);
      setSubmitting(false);
    }
  }, [flushAll, view.id, toResult]);

  // The clock: the server's deadline, corrected for the difference between the phone's and the server's time.
  const offset = Date.parse(view.serverNow) - view.receivedAt;
  const deadline = view.deadlineAt ? Date.parse(view.deadlineAt) : null;
  const [now, setNow] = useState(view.receivedAt);
  const remaining = deadline === null ? null : (deadline - (now + offset)) / 1000;
  const timeUp = remaining !== null && remaining <= 0;
  // When time runs out the answers are sent and the attempt submitted (retried every few seconds if offline).
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);
  const autoSubmitting = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      if (deadline !== null && deadline - (tick + offset) <= 0 && !autoSubmitting.current) {
        autoSubmitting.current = true;
        void finishRef.current().finally(() => {
          setTimeout(() => (autoSubmitting.current = false), 5000);
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline, offset]);

  // Android back and the iOS swipe ask before leaving (answers are saved; the clock keeps running).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setLeaving(true);
      return true;
    });
    navigation.setOptions({ gestureEnabled: false });
    return () => sub.remove();
  }, [navigation]);

  const q = questions[index];
  const answered = (qq: Flat) => {
    const e = entries[qq.questionId];
    return Boolean(e && toResponse(qq.question, e.draft));
  };
  const counts = {
    answered: questions.filter(answered).length,
    marked: questions.filter((qq) => entries[qq.questionId]?.marked).length,
  };
  if (!q) return null;
  const entry: Entry = entries[q.questionId] ?? { draft: { ...emptyDraft }, marked: false };
  const multiSection = view.sections.length > 1;
  const title = localized(view.assessment.title, locale);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.fill, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable
          role="button"
          aria-label={t('exam.leave')}
          onPress={() => setLeaving(true)}
          style={styles.iconButton}
          hitSlop={4}
        >
          <X size={22} color={colors.text} strokeWidth={1.75} />
        </Pressable>
        <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </Text>
        {remaining !== null ? (
          <View
            role="timer"
            aria-label={t('exam.timeLeft', { time: formatDuration(Math.ceil(remaining), locale) })}
            style={[
              styles.timer,
              { backgroundColor: remaining < 300 ? colors.dangerSoft : colors.primarySoft },
            ]}
          >
            <Clock size={16} color={remaining < 300 ? colors.danger : colors.onPrimarySoft} strokeWidth={2} />
            <Text
              variant="h4"
              style={{
                fontVariant: ['tabular-nums'],
                color: remaining < 300 ? colors.danger : colors.onPrimarySoft,
              }}
            >
              {formatDuration(Math.max(0, Math.ceil(remaining)), locale)}
            </Text>
          </View>
        ) : null}
        <Pressable
          role="button"
          aria-label={t('exam.palette')}
          onPress={() => setPalette(true)}
          style={styles.iconButton}
          hitSlop={4}
        >
          <LayoutGrid size={22} color={colors.text} strokeWidth={1.75} />
        </Pressable>
      </View>
      <SaveLine state={saveState} />
      {remaining !== null && remaining > 0 && remaining < 300 ? (
        <View style={{ paddingHorizontal: 20 }}>
          <Banner tone="info" message={t('exam.fiveMinutes')} />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {multiSection ? (
          <Text variant="caption" color="textMuted" style={styles.overline}>
            {view.sections[q.section]?.title
              ? localized(view.sections[q.section]!.title!, locale)
              : t('exam.section', { n: num(q.section + 1, locale) })}
          </Text>
        ) : null}
        <View style={styles.qHead}>
          <Text variant="label" color="textSecondary" style={{ flex: 1 }}>
            {t('exam.questionOf', { n: num(index + 1, locale), total: num(questions.length, locale) })}
          </Text>
          <Text variant="caption" color="textSecondary">
            +{marks(q.marks, locale)}
            {q.negativeMarks ? `  −${marks(q.negativeMarks, locale)}` : ''}
          </Text>
        </View>
        <QuestionBody q={q} media={view.media} />
        <AnswerInput
          key={q.questionId}
          body={q.question}
          draft={entry.draft}
          onChange={(draft) => update(q.questionId, { draft })}
          written
          media={view.media}
        />
        <Pressable
          role="checkbox"
          aria-checked={entry.marked}
          onPress={() => update(q.questionId, { marked: !entry.marked })}
          style={[
            styles.mark,
            {
              borderColor: entry.marked ? colors.warning : colors.border,
              backgroundColor: entry.marked ? colors.warningSoft : colors.surface,
            },
          ]}
        >
          <Flag size={18} color={entry.marked ? colors.warning : colors.textSecondary} strokeWidth={1.75} />
          <Text variant="label">{t('exam.markReview')}</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        <Button
          label={t('exam.previous')}
          variant="secondary"
          size="md"
          disabled={index === 0}
          onPress={() => setIndex((i) => Math.max(0, i - 1))}
          style={{ flex: 1 }}
        />
        {index < questions.length - 1 ? (
          <Button
            label={t('exam.next')}
            size="md"
            onPress={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            style={{ flex: 1 }}
          />
        ) : (
          <Button label={t('exam.finish')} size="md" onPress={() => setConfirm(true)} style={{ flex: 1 }} />
        )}
      </View>

      <Palette
        visible={palette}
        view={view}
        questions={questions}
        current={index}
        answered={answered}
        marked={(qq) => Boolean(entries[qq.questionId]?.marked)}
        onPick={(i) => {
          setIndex(i);
          setPalette(false);
        }}
        onSubmit={() => {
          setPalette(false);
          setConfirm(true);
        }}
        onClose={() => setPalette(false)}
      />

      <Dialog
        visible={confirm || timeUp}
        title={timeUp ? t('exam.timeUp') : t('exam.submitTitle')}
        onClose={() => !timeUp && setConfirm(false)}
      >
        <Text variant="body">
          {t('exam.submitBody', {
            answered: num(counts.answered, locale),
            unanswered: num(questions.length - counts.answered, locale),
            marked: num(counts.marked, locale),
          })}
        </Text>
        {!timeUp ? (
          <Text variant="bodySm" color="textSecondary">
            {t('exam.submitNote')}
          </Text>
        ) : null}
        {submitError ? <Banner message={t('exam.offline')} /> : null}
        <Button label={t('exam.submit')} loading={submitting} onPress={() => void finish()} />
        {!timeUp ? (
          <Button
            label={t('exam.keepWorking')}
            variant="tertiary"
            size="md"
            onPress={() => setConfirm(false)}
          />
        ) : null}
      </Dialog>

      <Dialog visible={leaving} title={t('exam.leaveTitle')} onClose={() => setLeaving(false)}>
        <Text variant="body">{t('exam.leaveBody')}</Text>
        <Button
          label={t('exam.leave')}
          variant="secondary"
          onPress={() => {
            setLeaving(false);
            void flushAll();
            if (router.canGoBack()) router.back();
            else router.replace({ pathname: '/test/[id]', params: { id: view.assessment.id } });
          }}
        />
        <Button
          label={t('exam.keepWorking')}
          variant="tertiary"
          size="md"
          onPress={() => setLeaving(false)}
        />
      </Dialog>
    </SafeAreaView>
  );
}

const emptyDraft = { options: [], bool: null, blanks: {}, pairs: {}, number: '', text: '' };

function SaveLine({ state }: { state: SaveState }) {
  const { t } = useT();
  return (
    <View style={styles.saveLine} role="status">
      <Text variant="caption" color={state === 'offline' ? 'danger' : 'textMuted'}>
        {state === 'saved' ? t('exam.saved') : state === 'saving' ? t('exam.saving') : t('exam.offline')}
      </Text>
    </View>
  );
}

function QuestionBody({ q, media }: { q: Flat; media: AttemptView['media'] }) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const [showPassage, setShowPassage] = useState(true);
  const stem = docFor(q.question.stem, locale);
  const passage = q.passage ? docFor(q.passage.content, locale) : null;
  return (
    <View style={{ gap: 12 }}>
      {q.passage && passage ? (
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
          {showPassage ? <RichText doc={passage} media={media} scale={0.94} /> : null}
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
        />
      ) : null}
    </View>
  );
}

function Palette({
  visible,
  view,
  questions,
  current,
  answered,
  marked,
  onPick,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  view: AttemptView;
  questions: Flat[];
  current: number;
  answered: (q: Flat) => boolean;
  marked: (q: Flat) => boolean;
  onPick: (index: number) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} aria-label={t('common.close')} />
      <View
        role="dialog"
        aria-label={t('exam.palette')}
        style={[styles.sheet, { backgroundColor: colors.surfaceRaised }]}
      >
        <Text variant="h4" role="heading">
          {t('exam.palette')}
        </Text>
        <View style={styles.legend}>
          <Legend color={colors.primary} filled label={t('exam.legend.answered')} />
          <Legend color={colors.borderStrong} label={t('exam.legend.notAnswered')} />
          <Legend color={colors.warning} filled label={t('exam.legend.marked')} />
        </View>
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 12 }}>
          {view.sections.map((s, si) => (
            <View key={si} style={{ gap: 8 }}>
              {view.sections.length > 1 ? (
                <Text variant="caption" color="textMuted" style={styles.overline}>
                  {s.title ? localized(s.title, locale) : t('exam.section', { n: num(si + 1, locale) })}
                </Text>
              ) : null}
              <View style={styles.grid}>
                {questions.map((q, i) => {
                  if (q.section !== si) return null;
                  const isMarked = marked(q);
                  const isAnswered = answered(q);
                  const state = isMarked
                    ? t('exam.legend.marked')
                    : isAnswered
                      ? t('exam.legend.answered')
                      : t('exam.legend.notAnswered');
                  const fill = isMarked ? colors.warning : isAnswered ? colors.primary : 'transparent';
                  return (
                    <Pressable
                      key={q.questionId}
                      role="button"
                      aria-label={t('exam.goTo', { n: num(i + 1, locale), state })}
                      aria-current={i === current}
                      onPress={() => onPick(i)}
                      style={[
                        styles.cell,
                        {
                          backgroundColor: fill,
                          borderColor:
                            i === current
                              ? colors.text
                              : isMarked
                                ? colors.warning
                                : isAnswered
                                  ? colors.primary
                                  : colors.borderStrong,
                          borderWidth: i === current ? 2.5 : 1.5,
                        },
                      ]}
                    >
                      <Text
                        variant="label"
                        style={{
                          color: isMarked ? colors.onPremium : isAnswered ? colors.onPrimary : colors.text,
                        }}
                      >
                        {num(i + 1, locale)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
        <Button label={t('exam.submit')} onPress={onSubmit} />
        <Button label={t('common.close')} variant="tertiary" size="md" onPress={onClose} />
      </View>
    </Modal>
  );
}

function Legend({ color, label, filled = false }: { color: string; label: string; filled?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[styles.legendDot, { borderColor: color, backgroundColor: filled ? color : 'transparent' }]}
      />
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: radius.full,
  },
  saveLine: { paddingHorizontal: 20, paddingTop: 6, alignItems: 'flex-end' },
  body: { padding: 20, gap: 16, paddingBottom: 32 },
  qHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  overline: { textTransform: 'uppercase', letterSpacing: 0.4 },
  passage: { borderRadius: radius.md, padding: 12, gap: 8 },
  passageHead: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  mark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.md,
    alignSelf: 'flex-start',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,27,61,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 14, height: 14, borderRadius: radius.full, borderWidth: 1.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: 48, height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
});
