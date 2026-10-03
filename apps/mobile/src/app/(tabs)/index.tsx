import { palette, radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMe, useTargetPosts } from '@/api/queries';
import { MyCourses } from '@/features/courses/my-courses';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { todayLabel } from '@/lib/dates';
import { initialsOf } from '@/lib/names';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { Card } from '@/ui/layout';
import { OfflineBanner } from '@/ui/states';
import { Text } from '@/ui/text';

/**
 * Home — foundation version: greeting with today's BS date, the exam being prepared for and My courses.
 * CMS-driven sections (daily challenge, shortcuts, banners, popular courses) are added in §9.
 */
export default function HomeScreen() {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const me = useMe();
  const targets = useTargetPosts();
  const firstName = me.data?.fullName.trim().split(/\s+/)[0] ?? '';
  const target = targets.data?.[0];

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: palette.navy800 }}>
        <OfflineBanner />
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: palette.blue600 }]} aria-hidden>
            <Text variant="h4" weight={700} style={{ color: palette.white }}>
              {initialsOf(me.data?.fullName ?? '')}
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
        </View>
      </SafeAreaView>
      <ScrollView contentContainerStyle={styles.body}>
        <Card style={{ gap: 10 }}>
          {target ? (
            <>
              <Text variant="caption" color="textMuted" style={styles.overline}>
                {[t('home.preparingFor'), ...target.path.map((p) => localized(p.name, locale))].join(' · ')}
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
        <Text variant="h3" role="heading">
          {t('home.myCourses')}
        </Text>
        <MyCourses />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: 20, gap: 16, width: '100%', maxWidth: 640, alignSelf: 'center' },
  overline: { textTransform: 'uppercase', letterSpacing: 0.4 },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
