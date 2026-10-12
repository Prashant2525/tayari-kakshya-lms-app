import { palette, radius } from '@tk/design-tokens';
import { router, type Href } from 'expo-router';
import {
  Award,
  BadgeCheck,
  BellRing,
  FileText,
  Info,
  LifeBuoy,
  ShieldCheck,
  Undo2,
  BookText,
  CalendarCheck,
  NotebookPen,
  Receipt,
  Bookmark,
  ChartNoAxesColumn,
  ChevronRight,
  ClipboardList,
  CloudDownload,
  Gift,
  Crown,
  KeyRound,
  LogOut,
  ShieldAlert,
  Target,
  Smartphone,
  UserPen,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCancelDeletion, useRequestDeletion } from '@/api/account';
import { usePages } from '@/api/support';
import { appVersion } from '@/api/client';
import { logout, useAppConfig, useMe, useTargetPosts } from '@/api/queries';
import { AvatarPhoto } from '@/features/profile/avatar-photo';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { usePrefs, type ThemePref } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { Banner, Card } from '@/ui/layout';
import { FadeInUp } from '@/ui/motion';
import { CompactBar, useScrollMotion, useStatusBarStyle } from '@/ui/scroll-header';
import { OfflineBanner } from '@/ui/states';
import { Segmented } from '@/ui/segmented';
import { Text } from '@/ui/text';
import { initialsOf } from '@/lib/names';
import { bsDate } from '@/lib/dates';
import { errorMessageKey } from '@/lib/error-message';
import { offlineSupported } from '@/lib/offline';

/** Foundation version: account summary, language, theme, verification and log out. Editing etc. come in §9. */
export default function ProfileScreen() {
  const { t, locale } = useT();
  const pages = usePages();
  const { colors } = useTheme();
  const me = useMe();
  const config = useAppConfig();
  const referralsOn = config.data?.referrals?.enabled === true;
  const targets = useTargetPosts();
  const theme = usePrefs((s) => s.theme);
  const [leaving, setLeaving] = useState(false);
  const user = me.data;
  const verified = Boolean(user?.emailVerified || user?.phoneVerified);
  const target = targets.data?.[0];
  const { scrollY, ...scroll } = useScrollMotion();
  // The navy hero sits under the status bar: light icons, in both themes.
  useStatusBarStyle('light');

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: palette.navy800 }}>
        <OfflineBanner />
      </SafeAreaView>
      <View style={styles.fill}>
        <Animated.ScrollView contentContainerStyle={styles.page} {...scroll}>
          <Animated.View
            style={[
              styles.hero,
              {
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
            <View aria-hidden style={[styles.glow, styles.glowBig]} />
            <View aria-hidden style={[styles.glow, styles.glowSmall]} />
            <Animated.View
              style={[
                styles.heroContent,
                {
                  opacity: scrollY.interpolate({
                    inputRange: [0, 120],
                    outputRange: [1, 0],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      translateY: scrollY.interpolate({
                        inputRange: [0, 160],
                        outputRange: [0, 56],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text variant="h1" role="heading" style={{ color: palette.white }}>
                {t('profile.title')}
              </Text>
              <View style={styles.identity}>
                <View style={styles.avatar} aria-hidden>
                  <Text variant="h3" weight={700} style={{ color: palette.white }}>
                    {initialsOf(user?.fullName ?? '')}
                  </Text>
                  {user?.avatarUrl ? <AvatarPhoto url={user.avatarUrl} /> : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="h3" weight={700} style={{ color: palette.white }}>
                    {user?.fullName}
                  </Text>
                  {user?.email ? (
                    <Text variant="bodySm" numberOfLines={1} style={{ color: palette.blue100 }}>
                      {user.email}
                    </Text>
                  ) : null}
                  {verified ? (
                    <View style={styles.inline}>
                      <BadgeCheck size={16} color={palette.blue100} strokeWidth={2} />
                      <Text variant="caption" style={{ color: palette.blue100 }}>
                        {t('profile.verified')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Animated.View>
          </Animated.View>

          <View style={styles.scroll}>
            <FadeInUp index={0}>
              <Pressable
                role="button"
                onPress={() => router.push('/onboarding')}
                style={[
                  styles.row,
                  styles.targetRow,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <IconTile icon={Target} />
                <Text variant="body" style={{ flex: 1 }}>
                  {target
                    ? t('profile.preparingFor', { target: localized(target.name, locale) })
                    : t('profile.noTarget')}
                </Text>
                <Text variant="label" color="link">
                  {t('common.change')}
                </Text>
              </Pressable>
            </FadeInUp>

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
                <IconTile icon={ShieldAlert} tone="warning" />
                <Text variant="body" style={{ flex: 1 }}>
                  {t('profile.verifyAccount')}
                </Text>
                <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />
              </Pressable>
            ) : null}
            <Card style={styles.linkGroup}>
              <LinkRow icon={UserPen} label={t('profile.edit')} href="/profile/edit" />
              <LinkRow
                icon={KeyRound}
                label={user?.hasPassword === false ? t('profile.setPassword') : t('profile.changePassword')}
                href="/profile/password"
              />
              <LinkRow icon={Smartphone} label={t('profile.devices')} href="/profile/devices" />
              <LinkRow icon={BellRing} label={t('notifSettings.title')} href="/profile/notifications" />
              <LinkRow icon={ChartNoAxesColumn} label={t('progress.title')} href="/progress" />
              <LinkRow icon={CalendarCheck} label={t('planner.title')} href="/planner" />
              <LinkRow icon={Bookmark} label={t('profile.saved.list')} href="/bookmarks" />
              {offlineSupported ? (
                <LinkRow icon={CloudDownload} label={t('offline.title')} href="/downloads" />
              ) : null}
              <LinkRow icon={ClipboardList} label={t('history.title')} href="/attempts" />
              <LinkRow icon={NotebookPen} label={t('mistakes.title')} href="/mistakes" />
              <LinkRow icon={Crown} label={t('plans.menu')} href="/plans" />
              {referralsOn ? <LinkRow icon={Gift} label={t('invite.menu')} href="/invite" /> : null}
              <LinkRow icon={Receipt} label={t('purchases.title')} href="/purchases" />
              <LinkRow icon={Award} label={t('cert.title')} href="/certificates" />
              <LinkRow icon={LifeBuoy} label={t('help.title')} href="/help" />
              <LinkRow
                icon={BookText}
                label={t('articles.kind.blog')}
                href={{ pathname: '/articles/[kind]', params: { kind: 'blog' } }}
                last
              />
            </Card>
            {pages.data && pages.data.length > 0 ? (
              <Card style={styles.linkGroup}>
                {pages.data.map((p, i) => (
                  <LinkRow
                    key={p.slug}
                    icon={PAGE_ICONS[p.slug]}
                    label={localized(p.title, locale)}
                    href={{ pathname: '/page/[slug]', params: { slug: p.slug } }}
                    last={i === pages.data.length - 1}
                  />
                ))}
              </Card>
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
            <DeleteAccount scheduledFor={user?.deletionScheduledFor ?? null} />
            <Text variant="caption" color="textMuted" align="center">
              {t('profile.version', { version: appVersion })}
            </Text>
          </View>
        </Animated.ScrollView>
        <CompactBar title={t('profile.title')} scrollY={scrollY} start={110} tone="brand" />
      </View>
    </View>
  );
}

/** A row's icon on a soft tinted tile. */
function IconTile({ icon: Icon, tone = 'primary' }: { icon: LucideIcon; tone?: 'primary' | 'warning' }) {
  const { colors } = useTheme();
  const warning = tone === 'warning';
  return (
    <View
      aria-hidden
      style={[styles.tile, { backgroundColor: warning ? colors.warningSoft : colors.primarySoft }]}
    >
      <Icon size={18} color={warning ? colors.warning : colors.onPrimarySoft} strokeWidth={1.9} />
    </View>
  );
}

const PAGE_ICONS = { about: Info, terms: FileText, privacy: ShieldCheck, refund: Undo2 } as const;

function LinkRow({
  icon: Icon,
  label,
  href,
  last = false,
}: {
  icon: LucideIcon;
  label: string;
  href: Href;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      role="link"
      aria-label={label}
      onPress={() => router.push(href)}
      style={({ pressed }) => [
        styles.link,
        pressed && { backgroundColor: colors.surfaceMuted },
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <IconTile icon={Icon} />
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />
    </Pressable>
  );
}

/** Account deletion (store requirement; D-032): asks once, then shows the date and lets the student keep it. */
function DeleteAccount({ scheduledFor }: { scheduledFor: string | null }) {
  const { t, locale } = useT();
  const request = useRequestDeletion();
  const cancel = useCancelDeletion();
  const [confirming, setConfirming] = useState(false);
  if (scheduledFor) {
    return (
      <Card style={{ gap: 10 }}>
        <Banner message={t('delete.scheduled', { date: bsDate(scheduledFor, locale) })} />
        <Button
          label={t('delete.keep')}
          variant="secondary"
          size="md"
          loading={cancel.isPending}
          onPress={() => cancel.mutate()}
        />
      </Card>
    );
  }
  if (!confirming) {
    return (
      <Button label={t('profile.delete')} variant="tertiary" size="md" onPress={() => setConfirming(true)} />
    );
  }
  return (
    <Card style={{ gap: 10 }}>
      <Text variant="h4" role="heading">
        {t('delete.title')}
      </Text>
      <Text variant="bodySm" color="textSecondary">
        {t('delete.body')}
      </Text>
      {request.isError ? <Banner message={t(errorMessageKey(request.error))} /> : null}
      <Button
        label={t('delete.confirm')}
        variant="destructive"
        size="md"
        loading={request.isPending}
        onPress={() => request.mutate(undefined, { onSuccess: () => setConfirming(false) })}
      />
      <Button label={t('common.cancel')} variant="tertiary" size="md" onPress={() => setConfirming(false)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { paddingBottom: 24 },
  // The navy hero, as on Home: rounded at the bottom with two soft circles.
  hero: {
    overflow: 'hidden',
    backgroundColor: palette.navy800,
    borderBottomLeftRadius: radius.xl + 4,
    borderBottomRightRadius: radius.xl + 4,
    paddingBottom: 48,
  },
  glow: { position: 'absolute', borderRadius: radius.full, backgroundColor: palette.blue600 },
  glowBig: { width: 260, height: 260, top: -110, right: -80, opacity: 0.35 },
  glowSmall: { width: 140, height: 140, bottom: -70, left: -40, opacity: 0.22 },
  heroContent: {
    gap: 18,
    paddingHorizontal: 20,
    paddingTop: 12,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  scroll: {
    paddingHorizontal: 20,
    marginTop: -28,
    gap: 14,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  linkGroup: { paddingVertical: 4, paddingHorizontal: 0, overflow: 'hidden' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14 },
  tile: {
    width: 34,
    height: 34,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.blue600,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  targetRow: { boxShadow: '0 10px 28px rgba(15,27,61,0.12)' },
  group: { textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 6, marginLeft: 4 },
});
