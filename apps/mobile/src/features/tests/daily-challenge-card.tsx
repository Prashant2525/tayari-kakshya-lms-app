import { radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { Flame, Trophy } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useDailyChallenge } from '@/api/assessments';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { marks, num } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { StatusChip } from '@/ui/chip';
import { Card, Skeleton } from '@/ui/layout';
import { Text } from '@/ui/text';

/** Home: today's challenge with the streak (DESIGN_SYSTEM §8 Home; D-049). Hidden while it fails to load. */
export function DailyChallengeCard() {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const daily = useDailyChallenge();
  if (daily.isPending) return <Skeleton height={120} />;
  if (daily.isError) return null;
  const { challenge, streak } = daily.data;
  const open = (id: string) => router.push({ pathname: '/test/[id]', params: { id } });
  const done = streak.doneToday;
  return (
    <Card style={{ gap: 10 }}>
      <View style={styles.head}>
        <Text variant="h4" role="heading" style={{ flex: 1 }}>
          {t('daily.title')}
        </Text>
        <View
          style={[styles.streak, { backgroundColor: streak.current ? colors.premium : colors.surfaceMuted }]}
          aria-label={
            streak.current ? t('daily.streak', { n: num(streak.current, locale) }) : t('daily.noStreak')
          }
        >
          <Flame size={16} color={streak.current ? colors.onPremium : colors.textSecondary} strokeWidth={2} />
          <Text variant="label" style={{ color: streak.current ? colors.onPremium : colors.textSecondary }}>
            {streak.current ? t('daily.streak', { n: num(streak.current, locale) }) : t('daily.noStreak')}
          </Text>
        </View>
      </View>
      {challenge ? (
        <>
          <Text variant="body">{localized(challenge.title, locale)}</Text>
          <Text variant="caption" color="textSecondary">
            {[
              t(challenge.questionCount === 1 ? 'test.question' : 'test.questions', {
                n: num(challenge.questionCount, locale),
              }),
              challenge.durationSeconds
                ? t('test.minutes', { n: num(Math.round(challenge.durationSeconds / 60), locale) })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <View style={styles.actions}>
            {done &&
            challenge.result &&
            challenge.result.score !== null &&
            challenge.result.maxScore !== null ? (
              <StatusChip
                tone="done"
                label={`${t('daily.doneToday')} · ${marks(challenge.result.score, locale)}/${marks(challenge.result.maxScore, locale)}`}
              />
            ) : done ? (
              <StatusChip tone="done" label={t('daily.doneToday')} />
            ) : (
              <Button
                label={challenge.inProgressAttemptId ? t('common.continue') : t('daily.start')}
                size="md"
                onPress={() => open(challenge.id)}
                style={{ flex: 1 }}
              />
            )}
            {done && challenge.leaderboardEnabled ? (
              <Pressable
                role="link"
                aria-label={t('leaderboard.see')}
                onPress={() => router.push({ pathname: '/leaderboard/[id]', params: { id: challenge.id } })}
                style={styles.link}
              >
                <Trophy size={16} color={colors.link} strokeWidth={2} />
                <Text variant="label" color="link">
                  {t('leaderboard.see')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : (
        <Text variant="bodySm" color="textSecondary">
          {t('daily.none')} · {t('daily.noneBody')}
        </Text>
      )}
      <Pressable role="link" aria-label={t('daily.past')} onPress={() => router.push('/daily')} hitSlop={6}>
        <Text variant="label" color="link">
          {t('daily.past')}
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: radius.full,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
});
