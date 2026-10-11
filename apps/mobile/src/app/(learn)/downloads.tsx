import { router } from 'expo-router';
import { BookOpen, CloudDownload, FileText, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useAppConfig } from '@/api/queries';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDate } from '@/lib/dates';
import { num } from '@/lib/format';
import { offlineSupported, useOffline } from '@/lib/offline';
import { usable } from '@/lib/offline-rules';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { BackButton, Card, Screen } from '@/ui/layout';
import { EmptyState } from '@/ui/states';
import { Text } from '@/ui/text';

/** Profile → Downloads (D-067): saved lessons, until when they open offline, and removing them. */
export default function DownloadsScreen() {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const config = useAppConfig();
  const items = useOffline((s) => s.items);
  const serverTime = useOffline((s) => s.serverTime);
  // The time when the screen opened (checked again when it opens next).
  const [now] = useState(() => Date.now());
  const entries = Object.values(items).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  useEffect(() => useOffline.getState().load(), []);

  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('offline.title')}
        </Text>
      </View>
      {!offlineSupported ? (
        <EmptyState icon={CloudDownload} title={t('offline.notHere')} />
      ) : entries.length === 0 ? (
        <EmptyState icon={CloudDownload} title={t('offline.empty')} body={t('offline.emptyBody')} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {entries.map((e) => {
            const ok = usable(e, now, serverTime);
            const Icon = e.type === 'pdf' ? FileText : BookOpen;
            return (
              <Card key={e.id} style={styles.row}>
                <Pressable
                  role="link"
                  aria-label={localized(e.title, locale)}
                  style={{ flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' }}
                  onPress={() =>
                    router.push({
                      pathname: '/learn/[itemId]',
                      params: {
                        itemId: e.id,
                        courseId: e.courseId ?? '',
                        subjectId: e.subjectId ?? '',
                        slug: e.slug ?? '',
                      },
                    })
                  }
                >
                  <Icon size={20} color={colors.onPrimarySoft} strokeWidth={1.75} />
                  <View style={{ flex: 1 }}>
                    <Text variant="label">{localized(e.title, locale)}</Text>
                    <Text variant="caption" color={ok ? 'textMuted' : 'warning'}>
                      {ok ? t('offline.until', { date: bsDate(e.expiresAt, locale) }) : t('offline.expired')}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  role="button"
                  aria-label={`${t('offline.remove')}: ${localized(e.title, locale)}`}
                  onPress={() => useOffline.getState().remove(e.id)}
                  hitSlop={6}
                  style={styles.icon}
                >
                  <Trash2 size={20} color={colors.textSecondary} strokeWidth={1.75} />
                </Pressable>
              </Card>
            );
          })}
          <Button
            label={t('offline.removeAll')}
            variant="secondary"
            onPress={() => useOffline.getState().clear()}
          />
          <Text variant="caption" color="textMuted">
            {t('offline.info', { days: num(config.data?.offline?.days ?? 7, locale) })}
          </Text>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  list: { gap: 10, paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
