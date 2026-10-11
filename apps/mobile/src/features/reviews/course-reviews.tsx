import type { PublicReview } from '@tk/contracts';
import { radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { Star } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useCourseReviews, useDeleteReview, useMyReview, useSaveReview } from '@/api/reviews';
import type { MessageKey } from '@/i18n/en';
import { useT } from '@/i18n/use-t';
import { bsDate } from '@/lib/dates';
import { errorMessageKey } from '@/lib/error-message';
import { num } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { StatusChip } from '@/ui/chip';
import { Dialog } from '@/ui/dialog';
import { Banner, Card } from '@/ui/layout';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';
import { Stars } from './stars';

const SHOWN = 3;

/** Course page: the rating, the latest approved reviews, and — for students who have the course — their own. */
export function CourseReviews({
  courseId,
  slug,
  entitled,
}: {
  courseId: string;
  slug: string;
  entitled: boolean;
}) {
  const { t, locale } = useT();
  const reviews = useCourseReviews(slug, SHOWN);
  const first = reviews.data?.pages[0];
  const summary = first?.summary;
  return (
    <View style={{ gap: 8 }}>
      <Text variant="h4" role="heading">
        {t('reviews.title')}
      </Text>
      {summary && summary.count > 0 ? (
        <Card style={{ gap: 10 }}>
          <View style={styles.summary}>
            <Text variant="display" weight={700}>
              {num(summary.average, locale)}
            </Text>
            <View
              style={{ gap: 4 }}
              role="img"
              aria-label={
                summary.count === 1
                  ? t('reviews.ratedOne', { average: num(summary.average, locale) })
                  : t('reviews.rated', {
                      average: num(summary.average, locale),
                      count: num(summary.count, locale),
                    })
              }
            >
              <Stars rating={summary.average} size={18} />
              <Text variant="caption" color="textSecondary">
                {summary.count === 1
                  ? t('reviews.countOne')
                  : t('reviews.count', { count: num(summary.count, locale) })}
              </Text>
            </View>
          </View>
          <StarBars stars={summary.stars} total={summary.count} />
        </Card>
      ) : first ? (
        <Text variant="body" color="textSecondary">
          {t('reviews.none')}
        </Text>
      ) : null}
      {first?.data.map((r) => (
        <ReviewCard key={r.id} review={r} />
      ))}
      {summary && summary.count > SHOWN ? (
        <Button
          label={t('reviews.seeAll')}
          variant="secondary"
          size="md"
          onPress={() => router.push({ pathname: '/course-reviews/[slug]', params: { slug } })}
        />
      ) : null}
      {entitled ? <MyReviewCard courseId={courseId} /> : null}
    </View>
  );
}

function StarBars({ stars, total }: { stars: Record<'1' | '2' | '3' | '4' | '5', number>; total: number }) {
  const { t, locale } = useT();
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      {(['5', '4', '3', '2', '1'] as const).map((n) => (
        <View
          key={n}
          style={styles.barRow}
          role="img"
          aria-label={t('reviews.starsRow', { stars: num(Number(n), locale), count: num(stars[n], locale) })}
        >
          <Text variant="caption" color="textSecondary" style={{ width: 14 }}>
            {num(Number(n), locale)}
          </Text>
          <View style={[styles.barTrack, { backgroundColor: colors.surfaceMuted }]}>
            <View
              style={[
                styles.barFill,
                { width: `${total ? (stars[n] / total) * 100 : 0}%`, backgroundColor: colors.warning },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ReviewCard({ review }: { review: PublicReview }) {
  const { t, locale } = useT();
  return (
    <Card style={{ gap: 6 }}>
      <View style={styles.cardHead}>
        <View role="img" aria-label={t('reviews.starsN', { n: num(review.rating, locale) })}>
          <Stars rating={review.rating} />
        </View>
        <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
          {review.author ?? t('reviews.anonymous')} · {bsDate(review.createdAt, locale)}
        </Text>
      </View>
      {review.body ? <Text variant="body">{review.body}</Text> : null}
    </Card>
  );
}

function MyReviewCard({ courseId }: { courseId: string }) {
  const { t, locale } = useT();
  const mine = useMyReview(courseId, true);
  const [editing, setEditing] = useState(false);
  const remove = useDeleteReview(courseId);
  const m = mine.data;
  if (!m) return null;
  const r = m.review;
  return (
    <Card style={{ gap: 8 }}>
      <Text variant="label">{t('reviews.mine')}</Text>
      {r ? (
        <>
          <View style={styles.cardHead}>
            <Stars rating={r.rating} />
            <StatusChip
              tone={r.status === 'approved' ? 'done' : r.status === 'pending' ? 'progress' : 'neutral'}
              label={t(`reviews.status.${r.status}`)}
            />
          </View>
          {r.body ? <Text variant="body">{r.body}</Text> : null}
          {r.status === 'rejected' && r.rejectionReason ? (
            <Banner tone="warning" message={t('reviews.rejectedBecause', { reason: r.rejectionReason })} />
          ) : null}
          {r.status === 'pending' ? (
            <Text variant="caption" color="textMuted">
              {t('reviews.pendingHint')}
            </Text>
          ) : null}
          {m.canReview ? (
            <Button
              label={t('reviews.edit')}
              variant="secondary"
              size="md"
              onPress={() => setEditing(true)}
            />
          ) : null}
          <Button
            label={t('reviews.delete')}
            variant="tertiary"
            size="md"
            loading={remove.isPending}
            onPress={() => remove.mutate()}
          />
        </>
      ) : m.canReview ? (
        <Button label={t('reviews.write')} variant="secondary" onPress={() => setEditing(true)} />
      ) : (
        <Text variant="bodySm" color="textSecondary">
          {t('reviews.notYet', {
            required: num(m.requiredPercent, locale),
            progress: num(m.progressPercent, locale),
          })}
        </Text>
      )}
      {editing ? (
        <ReviewForm
          courseId={courseId}
          initial={r ? { rating: r.rating, body: r.body ?? '' } : null}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </Card>
  );
}

function ReviewForm({
  courseId,
  initial,
  onClose,
}: {
  courseId: string;
  initial: { rating: number; body: string } | null;
  onClose: () => void;
}) {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const save = useSaveReview(courseId);
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [body, setBody] = useState(initial?.body ?? '');
  const [problem, setProblem] = useState<MessageKey | null>(null);
  const submit = () => {
    if (rating < 1) return setProblem('reviews.chooseRating');
    setProblem(null);
    save.mutate(
      { rating, body: body.trim() || null },
      { onSuccess: onClose, onError: (e) => setProblem(errorMessageKey(e)) },
    );
  };
  return (
    <Dialog visible title={initial ? t('reviews.edit') : t('reviews.write')} onClose={onClose}>
      <View style={{ gap: 14 }}>
        <View style={{ gap: 6 }}>
          <Text variant="label">{t('reviews.ratingLabel')}</Text>
          <View role="radiogroup" aria-label={t('reviews.ratingLabel')} style={styles.picker}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                role="radio"
                aria-checked={rating === n}
                aria-label={
                  n === 1
                    ? t('reviews.star', { n: num(n, locale) })
                    : t('reviews.starsN', { n: num(n, locale) })
                }
                onPress={() => setRating(n)}
                hitSlop={4}
                style={styles.pickStar}
              >
                <Star
                  size={32}
                  color={n <= rating ? colors.warning : colors.textMuted}
                  fill={n <= rating ? colors.warning : 'transparent'}
                  strokeWidth={1.5}
                />
              </Pressable>
            ))}
          </View>
        </View>
        <TextField
          label={t('reviews.textLabel')}
          value={body}
          onChangeText={setBody}
          rows={4}
          maxLength={2000}
        />
        {problem ? <Banner message={t(problem)} /> : null}
        <Text variant="caption" color="textMuted">
          {t('reviews.pendingHint')}
        </Text>
        <Button label={t('reviews.send')} loading={save.isPending} onPress={submit} />
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barTrack: { flex: 1, height: 8, borderRadius: radius.full, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.full },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  picker: { flexDirection: 'row', gap: 6 },
  pickStar: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
