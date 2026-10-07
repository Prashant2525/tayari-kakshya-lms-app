import { radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { markNotificationsRead, useNotificationsInbox, type NotificationRow } from '@/api/notices';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDate } from '@/lib/dates';
import { hrefFor } from '@/lib/push';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { BackButton, Screen, Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** The student's notifications (D-033): purchases, results, reminders and course updates; tap to open. */
export default function NotificationsScreen() {
  const { t } = useT();
  const inbox = useNotificationsInbox();
  const rows = inbox.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading" style={{ flex: 1 }}>
          {t('notifications.title')}
        </Text>
        {rows.some((r) => !r.read) ? (
          <Button
            label={t('notifications.readAll')}
            variant="tertiary"
            onPress={() => void markNotificationsRead([])}
          />
        ) : null}
      </View>
      {inbox.isPending ? (
        <View style={{ gap: 10 }} aria-busy>
          <Skeleton height={72} />
          <Skeleton height={72} />
        </View>
      ) : inbox.isError ? (
        <ErrorState error={inbox.error} onRetry={() => void inbox.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Bell} title={t('notifications.empty')} body={t('notifications.emptyBody')} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
          renderItem={({ item }) => <Row n={item} />}
          onEndReached={() => inbox.hasNextPage && void inbox.fetchNextPage()}
        />
      )}
    </Screen>
  );
}

function Row({ n }: { n: NotificationRow }) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const title = localized(n.title, locale);
  return (
    <Pressable
      role="link"
      aria-label={n.read ? title : `${t('notifications.unread')}: ${title}`}
      onPress={() => {
        if (!n.read) void markNotificationsRead([n.id]);
        const href = hrefFor(n.link);
        if (href) router.push(href);
      }}
      style={[
        styles.row,
        { backgroundColor: n.read ? colors.surface : colors.primarySoft, borderColor: colors.border },
      ]}
    >
      {!n.read ? <View style={[styles.dot, { backgroundColor: colors.primary }]} aria-hidden /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight={n.read ? 400 : 600}>
          {title}
        </Text>
        <Text variant="bodySm" color="textSecondary" numberOfLines={2}>
          {localized(n.body, locale)}
        </Text>
        <Text variant="caption" color="textMuted">
          {bsDate(n.createdAt, locale)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  row: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    alignItems: 'flex-start',
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
});
