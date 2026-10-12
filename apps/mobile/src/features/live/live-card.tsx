import { radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { ChevronRight, PlayCircle, Radio, Video } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLiveClasses, type LiveClassView } from '@/api/live';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDateTime } from '@/lib/dates';
import { num } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { StatusChip } from '@/ui/chip';
import { useSurfaceStyle } from '@/ui/layout';
import { PressableScale } from '@/ui/motion';
import { Text } from '@/ui/text';

const open = (id: string) => router.push({ pathname: '/live/[id]', params: { id } });

/** "Live now" with a dot: never colour alone (DESIGN_SYSTEM §1). */
export function LiveNowPill() {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <View style={[styles.pill, { backgroundColor: colors.dangerSoft }]}>
      <View style={[styles.dot, { backgroundColor: colors.danger }]} />
      <Text variant="caption" weight={700} style={{ color: colors.danger }}>
        {t('live.now')}
      </Text>
    </View>
  );
}

/** The chips under a class: live / cancelled / ended, Free or Premium, recording, attended. */
export function LiveChips({ live }: { live: LiveClassView }) {
  const { t } = useT();
  return (
    <View style={styles.chips}>
      {live.status === 'live' ? <LiveNowPill /> : null}
      {live.status === 'cancelled' ? <StatusChip tone="neutral" label={t('live.cancelled')} /> : null}
      {live.status === 'ended' ? <StatusChip tone="neutral" label={t('live.ended')} /> : null}
      {live.accessLevel === 'free' ? (
        <StatusChip tone="done" label={t('live.free')} />
      ) : !live.access ? (
        <StatusChip tone="premium" label={t('live.premium')} />
      ) : null}
      {live.status === 'ended' && live.hasRecording ? (
        <StatusChip tone="progress" label={t('live.recording')} />
      ) : null}
      {live.attended ? <StatusChip tone="official" label={t('live.attended')} /> : null}
    </View>
  );
}

/** One class in a list. */
export function LiveClassRow({ live, showCourse = false }: { live: LiveClassView; showCourse?: boolean }) {
  const { colors } = useTheme();
  const surface = useSurfaceStyle();
  const { t, locale } = useT();
  const title = localized(live.title, locale);
  const Icon = live.status === 'ended' ? PlayCircle : live.provider === 'zoom' ? Video : Radio;
  return (
    <PressableScale
      role="link"
      aria-label={title}
      onPress={() => open(live.id)}
      style={[styles.row, surface]}
    >
      <View
        style={[
          styles.icon,
          { backgroundColor: live.status === 'live' ? colors.dangerSoft : colors.primarySoft },
        ]}
      >
        <Icon
          size={22}
          color={live.status === 'live' ? colors.danger : colors.onPrimarySoft}
          strokeWidth={1.75}
        />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="h4" numberOfLines={2} style={live.status === 'cancelled' ? styles.struck : undefined}>
          {title}
        </Text>
        <Text variant="caption" color="textSecondary">
          {[
            showCourse ? localized(live.course.title, locale) : null,
            bsDateTime(live.startsAt, locale),
            t('live.minutes', { n: num(live.durationMinutes, locale) }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <LiveChips live={live} />
      </View>
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />
    </PressableScale>
  );
}

/** Course page: its upcoming classes (a few), with a link to all of them. Hidden when there are none. */
export function CourseLiveClasses({ courseId }: { courseId: string }) {
  const { t } = useT();
  const upcoming = useLiveClasses('upcoming', courseId, 3);
  const rows = upcoming.data?.pages[0]?.data ?? [];
  if (!rows.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.head}>
        <Text variant="h4" role="heading" style={{ flex: 1 }}>
          {t('live.title')}
        </Text>
        <Pressable
          role="link"
          hitSlop={12}
          onPress={() => router.push({ pathname: '/live', params: { courseId } })}
        >
          <Text variant="label" color="link">
            {t('live.seeAll')}
          </Text>
        </Pressable>
      </View>
      {rows.map((l) => (
        <LiveClassRow key={l.id} live={l} />
      ))}
    </View>
  );
}

/** Home: the next class of the student's courses (or the one live now). Hidden when there is none. */
export function HomeLiveCard() {
  const { t } = useT();
  const upcoming = useLiveClasses('upcoming', undefined, 3);
  const next = (upcoming.data?.pages[0]?.data ?? []).find((l) => l.status !== 'cancelled');
  if (!next) return null;
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.head}>
        <Text variant="h4" role="heading" style={{ flex: 1 }}>
          {next.status === 'live' ? t('live.homeNow') : t('live.homeNext')}
        </Text>
        <Pressable role="link" hitSlop={12} onPress={() => router.push('/live')}>
          <Text variant="label" color="link">
            {t('live.seeAll')}
          </Text>
        </Pressable>
      </View>
      <LiveClassRow live={next} showCourse />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  head: { flexDirection: 'row', alignItems: 'center' },
  struck: { textDecorationLine: 'line-through' },
});
