import { palette, radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { BadgeCheck, ChevronRight, LogOut, ShieldAlert } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { appVersion } from '@/api/client';
import { logout, useMe, useTargetPosts } from '@/api/queries';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { usePrefs, type ThemePref } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { Card, Screen } from '@/ui/layout';
import { Segmented } from '@/ui/segmented';
import { Text } from '@/ui/text';
import { initialsOf } from '@/lib/names';

/** Foundation version: account summary, language, theme, verification and log out. Editing etc. come in §9. */
export default function ProfileScreen() {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const me = useMe();
  const targets = useTargetPosts();
  const theme = usePrefs((s) => s.theme);
  const [leaving, setLeaving] = useState(false);
  const user = me.data;
  const verified = Boolean(user?.emailVerified || user?.phoneVerified);
  const target = targets.data?.[0];

  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="h1" role="heading">
          {t('profile.title')}
        </Text>
        <Card style={styles.headerCard}>
          <View style={[styles.avatar, { backgroundColor: palette.blue600 }]} aria-hidden>
            <Text variant="h3" weight={700} style={{ color: palette.white }}>
              {initialsOf(user?.fullName ?? '')}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="h4">{user?.fullName}</Text>
            {user?.email ? (
              <Text variant="bodySm" color="textSecondary" numberOfLines={1}>
                {user.email}
              </Text>
            ) : null}
            {verified ? (
              <View style={styles.inline}>
                <BadgeCheck size={16} color={colors.success} strokeWidth={1.75} />
                <Text variant="caption" color="success">
                  {t('profile.verified')}
                </Text>
              </View>
            ) : null}
          </View>
        </Card>

        <Pressable
          role="button"
          onPress={() => router.push('/onboarding')}
          style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text variant="body" style={{ flex: 1 }}>
            {target
              ? t('profile.preparingFor', { target: localized(target.name, locale) })
              : t('profile.noTarget')}
          </Text>
          <Text variant="label" color="link">
            {t('common.change')}
          </Text>
        </Pressable>

        <Text variant="caption" color="textMuted" style={styles.group}>
          {t('profile.preferences')}
        </Text>
        <Card style={{ gap: 14 }}>
          <View style={{ gap: 6 }}>
            <Text variant="label">{t('lang.label')}</Text>
            <Segmented
              label={t('lang.label')}
              value={locale}
              options={[
                { value: 'en', label: t('lang.en') },
                { value: 'ne', label: t('lang.ne') },
              ]}
              onChange={(l) => usePrefs.getState().setLocale(l)}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text variant="label">{t('theme.label')}</Text>
            <Segmented<ThemePref>
              label={t('theme.label')}
              value={theme}
              options={[
                { value: 'system', label: t('theme.system') },
                { value: 'light', label: t('theme.light') },
                { value: 'dark', label: t('theme.dark') },
              ]}
              onChange={(v) => usePrefs.getState().setTheme(v)}
            />
          </View>
        </Card>

        <Text variant="caption" color="textMuted" style={styles.group}>
          {t('profile.account')}
        </Text>
        {!verified ? (
          <Pressable
            role="button"
            onPress={() => router.push('/verify')}
            style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <ShieldAlert size={20} color={colors.warning} strokeWidth={1.75} />
            <Text variant="body" style={{ flex: 1 }}>
              {t('profile.verifyAccount')}
            </Text>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />
          </Pressable>
        ) : null}
        <Button
          label={t('profile.logout')}
          variant="secondary"
          loading={leaving}
          icon={<LogOut size={18} color={colors.text} strokeWidth={1.75} />}
          onPress={() => {
            setLeaving(true);
            void logout();
          }}
        />
        <Text variant="caption" color="textMuted" align="center">
          {t('profile.version', { version: appVersion })}
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 0 },
  scroll: { padding: 20, gap: 14 },
  headerCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  group: { textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 6, marginLeft: 4 },
});
