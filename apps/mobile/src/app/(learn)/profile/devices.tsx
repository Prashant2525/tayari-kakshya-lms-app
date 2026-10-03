import { Smartphone } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRevokeSession, useSessions } from '@/api/account';
import { useT } from '@/i18n/use-t';
import { bsDate } from '@/lib/dates';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { StatusChip } from '@/ui/chip';
import { BackButton, Card, Screen, Skeleton } from '@/ui/layout';
import { ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** Devices signed in to this account (device limit, D-028); other devices can be signed out. */
export default function DevicesScreen() {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const sessions = useSessions();
  const revoke = useRevokeSession();
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('profile.devices')}
        </Text>
      </View>
      {sessions.isPending ? (
        <Skeleton height={72} />
      ) : sessions.isError ? (
        <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {sessions.data.map((s) => (
            <Card key={s.id} style={styles.row}>
              <Smartphone size={22} color={colors.textSecondary} strokeWidth={1.75} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label">{s.deviceName}</Text>
                <Text variant="caption" color="textMuted">
                  {t('devices.lastUsed', { date: bsDate(s.lastUsedAt, locale) })}
                </Text>
              </View>
              {s.current ? (
                <StatusChip tone="done" label={t('devices.thisDevice')} />
              ) : (
                <Button
                  label={t('devices.signOut')}
                  variant="secondary"
                  size="md"
                  loading={revoke.isPending && revoke.variables === s.id}
                  onPress={() => revoke.mutate(s.id)}
                />
              )}
            </Card>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  list: { gap: 10, paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
