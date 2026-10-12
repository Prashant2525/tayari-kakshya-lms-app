import { palette, radius } from '@tk/design-tokens';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { BadgeCheck, Camera, Mail, Smartphone, Trash2 } from 'lucide-react-native';
import type { Href } from 'expo-router';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { MeView } from '@tk/contracts';
import { useRemoveAvatar, useSetAvatar } from '@/api/account';
import { useAppConfig } from '@/api/queries';
import { useT } from '@/i18n/use-t';
import { ApiError } from '@/lib/api-client';
import { errorMessageKey } from '@/lib/error-message';
import { initialsOf } from '@/lib/names';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { Banner, Card } from '@/ui/layout';
import { Text } from '@/ui/text';
import { AvatarPhoto } from './avatar-photo';

/** Edit profile, top: the photo (change / remove) and the sign-in contacts, each changed on its own screen. */
export function ProfileIdentity({ me }: { me: MeView }) {
  const { t } = useT();
  const { colors } = useTheme();
  const config = useAppConfig();
  const setAvatar = useSetAvatar();
  const removeAvatar = useRemoveAvatar();
  const phoneEnabled = config.data?.verification.channels.phone === true;

  const pick = async () => {
    setAvatar.reset();
    removeAvatar.reset();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setAvatar.mutate({
      uri: asset.uri,
      name: asset.fileName ?? 'photo.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
      file: asset.file ?? null,
    });
  };

  const photoError = setAvatar.error ?? removeAvatar.error;
  const busy = setAvatar.isPending || removeAvatar.isPending;
  return (
    <View style={{ gap: 16 }}>
      <View style={styles.photoRow}>
        <View style={styles.avatar} aria-hidden>
          <Text variant="h2" weight={700} style={{ color: palette.white }}>
            {initialsOf(me.fullName)}
          </Text>
          {me.avatarUrl ? <AvatarPhoto url={me.avatarUrl} /> : null}
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <Button
            label={me.avatarUrl ? t('profile.changePhoto') : t('profile.addPhoto')}
            variant="secondary"
            size="md"
            icon={<Camera size={18} color={colors.link} strokeWidth={1.75} />}
            loading={setAvatar.isPending}
            disabled={busy}
            onPress={() => void pick()}
          />
          {me.avatarUrl ? (
            <Button
              label={t('profile.removePhoto')}
              variant="tertiary"
              size="md"
              icon={<Trash2 size={18} color={colors.link} strokeWidth={1.75} />}
              loading={removeAvatar.isPending}
              disabled={busy}
              onPress={() => removeAvatar.mutate()}
            />
          ) : null}
        </View>
      </View>
      {photoError ? (
        <Banner
          message={t(
            photoError instanceof ApiError && photoError.status >= 413 && photoError.status <= 422
              ? 'profile.photoInvalid'
              : errorMessageKey(photoError),
          )}
        />
      ) : null}
      <Card style={{ gap: 0, padding: 0 }}>
        <ContactRow
          icon={Mail}
          label={t('auth.email')}
          value={me.email}
          verified={me.emailVerified}
          action={t('common.change')}
          href="/profile/email"
        />
        {phoneEnabled ? (
          <ContactRow
            icon={Smartphone}
            label={t('verify.phoneLabel')}
            value={me.phone}
            verified={me.phoneVerified}
            action={me.phone ? t('common.change') : t('profile.addPhone')}
            href="/profile/phone"
            divided
          />
        ) : null}
      </Card>
    </View>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
  verified,
  action,
  href,
  divided = false,
}: {
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  value: string | null;
  verified: boolean;
  action: string;
  href: Href;
  /** A line above the row (every row after the first). */
  divided?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <View
      style={[
        styles.contact,
        divided && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
      ]}
    >
      <Icon size={20} color={colors.textSecondary} strokeWidth={1.75} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
        <Text variant="body" numberOfLines={1}>
          {value ?? t('profile.notSet')}
        </Text>
        {value && verified ? (
          <View style={styles.inline}>
            <BadgeCheck size={14} color={colors.success} strokeWidth={2} />
            <Text variant="caption" color="success">
              {t('profile.verified')}
            </Text>
          </View>
        ) : null}
      </View>
      <Pressable
        role="link"
        aria-label={`${action}: ${label}`}
        hitSlop={12}
        onPress={() => router.push(href)}
      >
        <Text variant="label" color="link">
          {action}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.blue600,
    overflow: 'hidden',
  },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
