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
  NotebookPen,
  Receipt,
  Bookmark,
  ChevronRight,
  ClipboardList,
  Gift,
  Crown,
  KeyRound,
  LogOut,
  ShieldAlert,
  Smartphone,
  UserPen,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useCancelDeletion, useRequestDeletion } from '@/api/account';
import { usePages } from '@/api/support';
import { appVersion } from '@/api/client';
import { logout, useAppConfig, useMe, useTargetPosts } from '@/api/queries';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { usePrefs, type ThemePref } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { Banner, Card, Screen } from '@/ui/layout';
import { Segmented } from '@/ui/segmented';
import { Text } from '@/ui/text';
import { initialsOf } from '@/lib/names';
import { bsDate } from '@/lib/dates';
import { errorMessageKey } from '@/lib/error-message';

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
        <Card style={styles.linkGroup}>
          <LinkRow icon={UserPen} label={t('profile.edit')} href="/profile/edit" />
          <LinkRow
            icon={KeyRound}
            label={user?.hasPassword === false ? t('profile.setPassword') : t('profile.changePassword')}
            href="/profile/password"
          />
          <LinkRow icon={Smartphone} label={t('profile.devices')} href="/profile/devices" />
          <LinkRow icon={BellRing} label={t('notifSettings.title')} href="/profile/notifications" />
          <LinkRow icon={Bookmark} label={t('profile.saved.list')} href="/bookmarks" />
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
      </ScrollView>
    </Screen>
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
      style={[
        styles.link,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <Icon size={20} color={colors.textSecondary} strokeWidth={1.75} />
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
  content: { paddingHorizontal: 0 },
  scroll: { padding: 20, gap: 14 },
  linkGroup: { paddingVertical: 4, paddingHorizontal: 14 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
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
