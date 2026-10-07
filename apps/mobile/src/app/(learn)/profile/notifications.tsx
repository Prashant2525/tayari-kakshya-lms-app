import { radius } from '@tk/design-tokens';
import type { NotificationCategory, NotificationPreferencesInput } from '@tk/contracts';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useNotificationPreferences, useSaveNotificationPreferences } from '@/api/notices';
import { useT } from '@/i18n/use-t';
import { errorMessageKey } from '@/lib/error-message';
import { pushAvailable } from '@/lib/push';
import { useTheme } from '@/theme/theme';
import { BackButton, Banner, Screen, Skeleton } from '@/ui/layout';
import { ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

const CATEGORIES: NotificationCategory[] = [
  'notice',
  'article',
  'course_update',
  'exam_reminder',
  'result',
  'purchase',
];
/** Purchases have no email choice: the receipt email always goes (D-057), and it is the purchase email. */
const CHANNELS: Record<NotificationCategory, ReadonlyArray<'push' | 'email'>> = {
  notice: ['push', 'email'],
  course_update: ['push', 'email'],
  exam_reminder: ['push', 'email'],
  result: ['push', 'email'],
  purchase: ['push'],
  article: ['push', 'email'],
};

/** Profile → Notifications (D-033): what to hear about by push and by email. The in-app list always shows everything. */
export default function NotificationSettingsScreen() {
  const { colors } = useTheme();
  const { t } = useT();
  const prefs = useNotificationPreferences();
  const save = useSaveNotificationPreferences();
  const value = save.variables ?? prefs.data;

  const toggle = (category: NotificationCategory, channel: 'push' | 'email', on: boolean) => {
    if (!value) return;
    const next: NotificationPreferencesInput = {
      ...value,
      [category]: { ...value[category], [channel]: on },
    };
    save.mutate(next);
  };

  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('notifSettings.title')}
        </Text>
      </View>
      {prefs.isPending ? (
        <Skeleton height={300} />
      ) : prefs.isError ? (
        <ErrorState error={prefs.error} onRetry={() => void prefs.refetch()} />
      ) : value ? (
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
          <Text variant="bodySm" color="textSecondary">
            {t('notifSettings.intro')}
          </Text>
          {!pushAvailable ? <Banner tone="info" message={t('notifSettings.noPush')} /> : null}
          {save.error ? <Banner message={t(errorMessageKey(save.error))} /> : null}
          {CATEGORIES.map((c) => (
            <View
              key={c}
              role="group"
              aria-label={t(`notifSettings.${c}`)}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text variant="body" weight={600}>
                {t(`notifSettings.${c}`)}
              </Text>
              {CHANNELS[c].map((channel) => (
                <View key={channel} style={styles.row}>
                  <Text variant="bodySm" style={{ flex: 1 }}>
                    {t(`notifSettings.${channel}`)}
                  </Text>
                  <Switch
                    value={value[c][channel]}
                    onValueChange={(on) => toggle(c, channel, on)}
                    aria-label={`${t(`notifSettings.${c}`)} · ${t(`notifSettings.${channel}`)}`}
                    trackColor={{ true: colors.primary, false: colors.borderStrong }}
                    thumbColor={colors.surface}
                    // The web build's "on" thumb (react-native-web only; teal by default).
                    {...({ activeThumbColor: colors.surface } as object)}
                  />
                </View>
              ))}
              {c === 'purchase' ? (
                <Text variant="caption" color="textSecondary">
                  {t('notifSettings.receiptEmail')}
                </Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  card: { borderWidth: 1, borderRadius: radius.md, padding: 14, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
});
