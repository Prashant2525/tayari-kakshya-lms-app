import { radius } from '@tk/design-tokens';
import type { AnswerResponse } from '@tk/domain';
import { Check, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { LocalizedDoc, MediaMap, PracticeAnswer, PracticeQuestionBody, RichNode } from '@/api/learning';
import { RichText } from '@/features/learn/rich-text';
import { localized, type Locale } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { useTheme } from '@/theme/theme';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

/**
 * Answer inputs for every question type, shared by practice questions and exam mode. With `review` (an answer key),
 * the inputs are read-only and show correct / wrong choices.
 */

/** CMS text in the reader's language, falling back to the other one (D-008). */
export function docFor(doc: LocalizedDoc | null | undefined, locale: Locale): RichNode | null {
  if (!doc) return null;
  return (locale === 'ne' ? (doc.ne ?? doc.en) : (doc.en ?? doc.ne)) ?? null;
}

/** Plain text of a small rich document (for chips and labels). */
export function richPlain(doc: RichNode | null): string {
  if (!doc) return '';
  const out: string[] = [];
  const walk = (n: RichNode) => {
    if (typeof n.text === 'string') out.push(n.text);
    n.content?.forEach(walk);
  };
  walk(doc);
  return out.join('').trim();
}

/** What the student has entered so far, for any question type. */
export type Draft = {
  options: string[];
  bool: boolean | null;
  blanks: Record<string, string>;
  pairs: Record<string, string>;
  number: string;
  text: string;
};
export const EMPTY_DRAFT: Draft = { options: [], bool: null, blanks: {}, pairs: {}, number: '', text: '' };

/** The answer to send (null = not answered). Devanagari digits are accepted for numbers. */
export function toResponse(b: PracticeQuestionBody, d: Draft): AnswerResponse | null {
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
      return d.text.trim() ? { type: b.type, text: d.text } : null;
  }
}

/** A saved answer back into the inputs (resuming an attempt). */
export function fromResponse(r: AnswerResponse | null): Draft {
  if (!r) return EMPTY_DRAFT;
  switch (r.type) {
    case 'single_choice':
      return { ...EMPTY_DRAFT, options: r.optionId ? [r.optionId] : [] };
    case 'multiple_choice':
      return { ...EMPTY_DRAFT, options: r.optionIds };
    case 'true_false':
      return { ...EMPTY_DRAFT, bool: r.value };
    case 'fill_blank':
      return { ...EMPTY_DRAFT, blanks: r.blanks };
    case 'match':
      return { ...EMPTY_DRAFT, pairs: r.pairs };
    case 'numeric':
      return { ...EMPTY_DRAFT, number: r.value === null ? '' : String(r.value) };
    case 'subjective':
      return { ...EMPTY_DRAFT, text: r.text };
  }
}

export function AnswerInput({
  body,
  draft,
  onChange,
  review = null,
  written = false,
  media,
}: {
  body: PracticeQuestionBody;
  draft: Draft;
  onChange: (d: Draft) => void;
  /** Answer key: read-only with correct / wrong marks. */
  review?: PracticeAnswer | null;
  /** Show a text box for written (subjective) answers (exam mode). */
  written?: boolean;
  media: MediaMap;
}) {
  const { t, locale } = useT();
  const b = body;
  const a = review;
  const checked = a !== null;
  if (b.type === 'single_choice' || b.type === 'multiple_choice') {
    const correct =
      a?.type === 'single_choice'
        ? [a.correctOptionId]
        : a?.type === 'multiple_choice'
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
                onChange({
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
    const correct = a?.type === 'true_false' ? a.correct : null;
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
            onPress={() => onChange({ ...draft, bool: value })}
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
            onChangeText={(v) => onChange({ ...draft, blanks: { ...draft.blanks, [blank.id]: v } })}
          />
        ))}
      </View>
    );
  }
  if (b.type === 'match') {
    const pairs = a?.type === 'match' ? a.pairs : {};
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
                      onPress={() => onChange({ ...draft, pairs: { ...draft.pairs, [left.id]: right.id } })}
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
        onChangeText={(v) => onChange({ ...draft, number: v })}
      />
    );
  }
  if (b.type === 'subjective' && written) {
    return (
      <TextField
        label={t('exam.writtenAnswer')}
        value={draft.text}
        editable={!checked}
        multiline
        rows={6}
        maxLength={20_000}
        onChangeText={(v) => onChange({ ...draft, text: v })}
      />
    );
  }
  return null;
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
});
