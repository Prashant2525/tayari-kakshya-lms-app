import { radius } from '@tk/design-tokens';
import type { AnswerResponse, Outcome } from '@tk/domain';
import { router } from 'expo-router';
import { Check, ChevronDown, Flag, Lock, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { LocalizedDoc, MediaMap, PracticeQuestion, RichNode } from '@/api/learning';
import { RichText } from '@/features/learn/rich-text';
import { localized, type Locale } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { track } from '@/lib/analytics';
import { markBlanks, practiceOutcome } from '@/lib/practice';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { StatusChip } from '@/ui/chip';
import { Banner, Card } from '@/ui/layout';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';
import { BookmarkButton } from './bookmark-button';
import { ReportSheet } from './report-sheet';

/** CMS text in the reader's language, falling back to the other one (D-008). */
function docFor(doc: LocalizedDoc | null | undefined, locale: Locale): RichNode | null {
  if (!doc) return null;
  return (locale === 'ne' ? (doc.ne ?? doc.en) : (doc.en ?? doc.ne)) ?? null;
}

type Draft = {
  options: string[];
  bool: boolean | null;
  blanks: Record<string, string>;
  pairs: Record<string, string>;
  number: string;
};
const EMPTY: Draft = { options: [], bool: null, blanks: {}, pairs: {}, number: '' };

function toResponse(q: PracticeQuestion, d: Draft): AnswerResponse | null {
  const b = q.question;
  switch (b.type) {
    case 'single_choice':
      return d.options[0] ? { type: b.type, optionId: d.options[0] } : null;
    case 'multiple_choice':
      return d.options.length ? { type: b.type, optionIds: d.options } : null;
    case 'true_false':
      return d.bool === null ? null : { type: b.type, value: d.bool };
    case 'fill_blank':
      return Object.values(d.blanks).some((v) => v.trim()) ? { type: b.type, blanks: d.blanks } : null;
    case 'match':
      return Object.keys(d.pairs).length ? { type: b.type, pairs: d.pairs } : null;
    case 'numeric': {
      const value = Number(
        d.number.replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966)).replace(',', '.'),
      );
      return d.number.trim() && Number.isFinite(value) ? { type: b.type, value } : null;
    }
    case 'subjective':
      return null;
  }
}

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
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [outcome, setOutcome] = useState<Outcome | 'skipped' | null>(null);
  const [showPassage, setShowPassage] = useState(false);
  const [reporting, setReporting] = useState(false);
  const checked = outcome !== null && outcome !== 'skipped';
  const body = q.question;
  const answer = q.answer;
  const stem = docFor(body.stem, locale);
  const year = q.sources.find((s) => s.yearBs)?.yearBs;

  const check = () => {
    if (!answer) return;
    const response = toResponse(q, draft);
    const result = response ? practiceOutcome(answer, response) : 'skipped';
    setOutcome(result);
    if (result !== 'skipped')
      track('practice_answer_checked', { question_type: q.question.type, outcome: result });
  };
  const reset = () => {
    setDraft(EMPTY);
    setOutcome(null);
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
          <AnswerInput q={q} draft={draft} setDraft={setDraft} checked={checked} media={media} />
          {body.type === 'subjective' ? (
            <SubjectiveAnswer q={q} media={media} />
          ) : (
            <>
              {outcome === 'skipped' ? <Banner tone="info" message={t('practice.skipped')} /> : null}
              {checked ? <OutcomeBanner outcome={outcome} /> : null}
              {checked ? <Solution q={q} media={media} /> : null}
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

function OutcomeBanner({ outcome }: { outcome: Outcome | 'skipped' | null }) {
  const { t } = useT();
  if (outcome === 'correct') return <Banner tone="success" message={t('practice.correct')} />;
  if (outcome === 'partial') return <Banner tone="info" message={t('practice.partial')} />;
  return <Banner message={t('practice.wrong')} />;
}

/** The correct answer (choice questions show it on the options) and the explanation. */
function Solution({ q, media }: { q: PracticeQuestion; media: MediaMap }) {
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

function AnswerInput({
  q,
  draft,
  setDraft,
  checked,
  media,
}: {
  q: PracticeQuestion;
  draft: Draft;
  setDraft: (d: Draft) => void;
  checked: boolean;
  media: MediaMap;
}) {
  const { t, locale } = useT();
  const b = q.question;
  const a = q.answer!;
  if (b.type === 'single_choice' || b.type === 'multiple_choice') {
    const correct =
      a.type === 'single_choice'
        ? [a.correctOptionId]
        : a.type === 'multiple_choice'
          ? a.correctOptionIds
          : [];
    const multi = b.type === 'multiple_choice';
    return (
      <View role={multi ? 'list' : 'radiogroup'} style={{ gap: 8 }}>
        {b.options.map((o, i) => {
          const chosen = draft.options.includes(o.id);
          const doc = docFor(o.content, locale);
          return (
            <Option
              key={o.id}
              letter={String.fromCharCode(65 + i)}
              multi={multi}
              chosen={chosen}
              state={!checked ? 'idle' : correct.includes(o.id) ? 'correct' : chosen ? 'wrong' : 'idle'}
              disabled={checked}
              onPress={() =>
                setDraft({
                  ...draft,
                  options: multi
                    ? chosen
                      ? draft.options.filter((x) => x !== o.id)
                      : [...draft.options, o.id]
                    : [o.id],
                })
              }
            >
              {doc ? <RichText doc={doc} media={media} scale={0.94} /> : null}
            </Option>
          );
        })}
      </View>
    );
  }
  if (b.type === 'true_false') {
    const correct = a.type === 'true_false' ? a.correct : null;
    return (
      <View role="radiogroup" style={{ gap: 8 }}>
        {[true, false].map((value, i) => (
          <Option
            key={String(value)}
            letter={String.fromCharCode(65 + i)}
            chosen={draft.bool === value}
            state={
              !checked ? 'idle' : value === correct ? 'correct' : draft.bool === value ? 'wrong' : 'idle'
            }
            disabled={checked}
            onPress={() => setDraft({ ...draft, bool: value })}
          >
            <Text variant="body">{value ? t('practice.true') : t('practice.false')}</Text>
          </Option>
        ))}
      </View>
    );
  }
  if (b.type === 'fill_blank') {
    return (
      <View style={{ gap: 10 }}>
        {b.blanks.map((blank, i) => (
          <TextField
            key={blank.id}
            label={t('practice.blank', { n: i + 1 })}
            value={draft.blanks[blank.id] ?? ''}
            editable={!checked}
            autoCapitalize="none"
            onChangeText={(v) => setDraft({ ...draft, blanks: { ...draft.blanks, [blank.id]: v } })}
          />
        ))}
      </View>
    );
  }
  if (b.type === 'match') {
    const pairs = a.type === 'match' ? a.pairs : {};
    return (
      <View style={{ gap: 12 }}>
        {b.left.map((left) => {
          const leftText = docFor(left.content, locale);
          const label = leftText ? richPlain(leftText) : left.id;
          return (
            <View key={left.id} style={{ gap: 6 }}>
              {leftText ? <RichText doc={leftText} media={media} scale={0.94} /> : null}
              <View
                role="radiogroup"
                aria-label={t('practice.matchFor', { item: label })}
                style={styles.chips}
              >
                {b.right.map((right) => {
                  const chosen = draft.pairs[left.id] === right.id;
                  const state = !checked
                    ? 'idle'
                    : pairs[left.id] === right.id
                      ? 'correct'
                      : chosen
                        ? 'wrong'
                        : 'idle';
                  return (
                    <MatchChip
                      key={right.id}
                      label={richPlain(docFor(right.content, locale)) || right.id}
                      chosen={chosen}
                      state={state}
                      disabled={checked}
                      onPress={() => setDraft({ ...draft, pairs: { ...draft.pairs, [left.id]: right.id } })}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    );
  }
  if (b.type === 'numeric') {
    return (
      <TextField
        label={t('practice.number.input')}
        value={draft.number}
        editable={!checked}
        keyboardType="decimal-pad"
        hint={b.unit ? localized(b.unit, locale) : undefined}
        onChangeText={(v) => setDraft({ ...draft, number: v })}
      />
    );
  }
  return null;
}

/** Plain text of a small rich document (for chips and labels). */
function richPlain(doc: RichNode | null): string {
  if (!doc) return '';
  const out: string[] = [];
  const walk = (n: RichNode) => {
    if (typeof n.text === 'string') out.push(n.text);
    n.content?.forEach(walk);
  };
  walk(doc);
  return out.join('').trim();
}

type OptionState = 'idle' | 'correct' | 'wrong';

function Option({
  letter,
  chosen,
  state,
  multi = false,
  disabled,
  onPress,
  children,
}: {
  letter: string;
  chosen: boolean;
  state: OptionState;
  multi?: boolean;
  disabled: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const { t } = useT();
  const tone =
    state === 'correct'
      ? { border: colors.success, bg: colors.successSoft, mark: colors.success }
      : state === 'wrong'
        ? { border: colors.danger, bg: colors.dangerSoft, mark: colors.danger }
        : chosen
          ? { border: colors.primary, bg: colors.primarySoft, mark: colors.primary }
          : { border: colors.border, bg: colors.surface, mark: colors.borderStrong };
  return (
    <Pressable
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={chosen}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.option,
        {
          borderColor: tone.border,
          backgroundColor: tone.bg,
          borderWidth: chosen || state !== 'idle' ? 2 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.letter,
          { backgroundColor: chosen || state !== 'idle' ? tone.mark : 'transparent', borderColor: tone.mark },
        ]}
      >
        {state === 'correct' ? (
          <Check size={16} color={colors.onPrimary} strokeWidth={2.5} />
        ) : state === 'wrong' ? (
          <X size={16} color={colors.onPrimary} strokeWidth={2.5} />
        ) : (
          <Text variant="label" style={{ color: chosen ? colors.onPrimary : colors.textSecondary }}>
            {letter}
          </Text>
        )}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
      {state === 'correct' ? (
        <Text variant="caption" color="success">
          {t('practice.correct')}
        </Text>
      ) : state === 'wrong' ? (
        <Text variant="caption" color="danger">
          {t('practice.wrong')}
        </Text>
      ) : null}
    </Pressable>
  );
}

function MatchChip({
  label,
  chosen,
  state,
  disabled,
  onPress,
}: {
  label: string;
  chosen: boolean;
  state: OptionState;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const border =
    state === 'correct'
      ? colors.success
      : state === 'wrong'
        ? colors.danger
        : chosen
          ? colors.primary
          : colors.borderStrong;
  const bg =
    state === 'correct'
      ? colors.successSoft
      : state === 'wrong'
        ? colors.dangerSoft
        : chosen
          ? colors.primarySoft
          : colors.surface;
  return (
    <Pressable
      role="radio"
      aria-checked={chosen}
      aria-label={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: border, backgroundColor: bg, borderWidth: chosen || state !== 'idle' ? 2 : 1 },
      ]}
    >
      <Text variant="bodySm">{label}</Text>
    </Pressable>
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
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  letter: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', borderRadius: radius.full },
  overline: { textTransform: 'uppercase', letterSpacing: 0.4 },
});
