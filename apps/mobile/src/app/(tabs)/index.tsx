import { palette, radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { Bell, Search } from 'lucide-react-native';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMe, useTargetPosts } from '@/api/queries';
import { CurrentCourse } from '@/features/courses/current-course';
import { CatalogList } from '@/features/courses/my-courses';
import { ReadTiles } from '@/features/articles/read-tiles';
import { BannerCarousel } from '@/features/home/banner-carousel';
import { LatestNotices, UpcomingExams } from '@/features/home/home-strips';
import { HomeLiveCard } from '@/features/live/live-card';
import { TodayPlanCard } from '@/features/planner/today-plan-card';
import { ProgressLink } from '@/features/progress/progress-link';
import { DailyChallengeCard } from '@/features/tests/daily-challenge-card';
import { TestsLink } from '@/features/tests/tests-link';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { todayLabel } from '@/lib/dates';
import { initialsOf } from '@/lib/names';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { Card } from '@/ui/layout';
import { FadeInUp } from '@/ui/motion';
import { CompactBar, useScrollMotion, useStatusBarStyle } from '@/ui/scroll-header';
import { OfflineBanner } from '@/ui/states';
import { Text } from '@/ui/text';
import { useUnreadNotifications } from '@/api/notices';

/**
 * Home: greeting with today's BS date, the exam being prepared for, the current course with Continue, and courses
 * for that exam. CMS-managed home sections and banners come with §12 (DYNAMIC_ADMIN_AUDIT §2.3).
 */
export default function HomeScreen() {
  const { t, locale } = useT();
  const { colors, scheme } = useTheme();
  const me = useMe();
  const targets = useTargetPosts();
  const firstName = me.data?.fullName.trim().split(/\s+/)[0] ?? '';
  const target = targets.data?.[0];
  const unread = useUnreadNotifications(true).data?.count ?? 0;
  const { scrollY, ...scroll } = useScrollMotion();
  // The navy hero sits under the status bar: light icons, in both themes.
  useStatusBarStyle('light');
  const initials = initialsOf(me.data?.fullName ?? '');

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: palette.navy800 }}>
        <OfflineBanner />
      </SafeAreaView>
      <View style={styles.fill}>
        <Animated.ScrollView contentContainerStyle={styles.scroll} {...scroll}>
          {/* The hero stretches when pulled down; its greeting drifts and fades as the page scrolls over it. */}
          <Animated.View
            style={[
              styles.hero,
              {
                backgroundColor: palette.navy800,
                transformOrigin: 'top',
                transform: [
                  {
                    translateY: scrollY.interpolate({
                      inputRange: [-150, 0],
                      outputRange: [-150, 0],
                      extrapolateRight: 'clamp',
                    }),
                  },
                  {
                    scale: scrollY.interpolate({
                      inputRange: [-150, 0],
                      outputRange: [1.6, 1],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              },
            ]}
          >
            <Animated.View
              aria-hidden
              style={[
                styles.glow,
                styles.glowBig,
                {
                  transform: [
                    {
                      translateY: scrollY.interpolate({
                        inputRange: [0, 240],
                        outputRange: [0, 60],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                },
              ]}
            />
            <View aria-hidden style={[styles.glow, styles.glowSmall]} />
            <Animated.View
              style={[
                styles.header,
                {
                  opacity: scrollY.interpolate({
                    inputRange: [0, 90],
                    outputRange: [1, 0],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      translateY: scrollY.interpolate({
                        inputRange: [0, 120],
                        outputRange: [0, 48],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.avatar} aria-hidden>
                <Text variant="h4" weight={700} style={{ color: palette.white }}>
                  {initials}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="h3" weight={700} role="heading" style={{ color: palette.white }}>
                  {t('home.greeting', { name: firstName })}
                </Text>
                <Text variant="bodySm" style={{ color: palette.blue100 }}>
                  {todayLabel(new Date(), locale)}
                </Text>
              </View>
              <Pressable
                role="link"
                aria-label={
                  unread > 0 ? t('notifications.bellUnread', { count: unread }) : t('notifications.title')
                }
                onPress={() => router.push('/notifications')}
                hitSlop={8}
                style={styles.bell}
              >
                <Bell size={22} color={palette.white} strokeWidth={1.75} />
                {unread > 0 ? (
                  <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                    <Text
                      variant="caption"
                      weight={700}
                      style={{ color: palette.white, fontSize: 11, lineHeight: 14 }}
                    >
                      {unread > 9 ? '9+' : unread}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </Animated.View>
          </Animated.View>
          <View style={styles.body}>
            <FadeInUp index={0} style={styles.group}>
              <Pressable
                role="button"
                aria-label={t('search.placeholder')}
                onPress={() => router.push('/search')}
                style={[
                  styles.searchBar,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  scheme === 'light' && styles.floating,
                ]}
              >
                <Search size={20} color={colors.textMuted} strokeWidth={1.75} />
                <Text variant="body" color="textMuted">
                  {t('search.placeholder')}
                </Text>
              </Pressable>
              <BannerCarousel />
              <Card style={{ gap: 10 }}>
                {target ? (
                  <>
                    <Text variant="caption" color="textMuted" style={styles.overline}>
                      {[t('home.preparingFor'), ...target.path.map((p) => localized(p.name, locale))].join(
                        ' · ',
                      )}
                    </Text>
                    <View style={styles.targetRow}>
                      <Text variant="h3" style={{ flex: 1 }}>
                        {localized(target.name, locale)}
                      </Text>
                      <Button
                        label={t('common.change')}
                        variant="secondary"
                        size="md"
                        onPress={() => router.push('/onboarding')}
                      />
                    </View>
                  </>
                ) : (
                  <Button
                    label={t('home.chooseTarget')}
                    variant="secondary"
                    onPress={() => router.push('/onboarding')}
                  />
                )}
              </Card>
            </FadeInUp>
            <FadeInUp index={1} style={styles.group}>
              <HomeLiveCard />
              <CurrentCourse />
              <TodayPlanCard />
              <ReadTiles />
              <DailyChallengeCard />
              <UpcomingExams />
              <LatestNotices />
              <ProgressLink />
              <TestsLink title={t('home.tests')} body={t('home.testsBody')} />
            </FadeInUp>
            <FadeInUp index={2} style={styles.group}>
              <View style={styles.sectionHead}>
                <Text variant="h3" role="heading" style={{ flex: 1 }}>
                  {target ? t('home.forYou') : t('courses.all')}
                </Text>
                <Pressable
                  role="link"
                  onPress={() => router.navigate('/courses')}
                  style={styles.seeAll}
                  hitSlop={8}
                >
                  <Text variant="label" color="link">
                    {t('home.seeAll')}
                  </Text>
                </Pressable>
              </View>
              <CatalogList examNodeId={target?.id ?? null} q="" limit={5} />
            </FadeInUp>
          </View>
        </Animated.ScrollView>
        <CompactBar
          title={t('home.greeting', { name: firstName })}
          scrollY={scrollY}
          start={70}
          tone="brand"
          leading={
            <View style={[styles.avatar, styles.avatarSmall]}>
              <Text variant="caption" weight={700} style={{ color: palette.white }}>
                {initials}
              </Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingBottom: 24 },
  // The navy hero: rounded at the bottom, with two soft circles; the search bar floats over its edge.
  hero: {
    overflow: 'hidden',
    borderBottomLeftRadius: radius.xl + 4,
    borderBottomRightRadius: radius.xl + 4,
    paddingBottom: 44,
  },
  glow: { position: 'absolute', borderRadius: radius.full, backgroundColor: palette.blue600 },
  glowBig: { width: 260, height: 260, top: -120, right: -70, opacity: 0.35 },
  glowSmall: { width: 140, height: 140, bottom: -70, left: -40, opacity: 0.22 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.blue600,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  avatarSmall: { width: 28, height: 28, borderWidth: 1 },
  body: {
    paddingHorizontal: 20,
    marginTop: -28,
    gap: 16,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  group: { gap: 16 },
  overline: { textTransform: 'uppercase', letterSpacing: 0.4 },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  floating: { boxShadow: '0 10px 28px rgba(15,27,61,0.14)' },
  seeAll: { minHeight: 44, justifyContent: 'center' },
});
