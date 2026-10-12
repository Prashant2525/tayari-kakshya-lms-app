import { radius } from '@tk/design-tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { FileText } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNotice } from '@/api/notices';
import { RichText } from '@/features/learn/rich-text';
import { KIND_KEY } from '@/features/notices/kinds';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDate } from '@/lib/dates';
import { formatBytes } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { StatusChip } from '@/ui/chip';
import { BackButton, Screen, Skeleton, useSurfaceStyle } from '@/ui/layout';
import { PressableScale } from '@/ui/motion';
import { ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** One notice, as written in the CMS (rich text with images). */
export default function NoticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useT();
  const { colors } = useTheme();
  const surface = useSurfaceStyle();
  const notice = useNotice(id);
  const n = notice.data;
  const doc = n ? (n.body[locale] ?? n.body.en ?? n.body.ne) : undefined;
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
      </View>
      {notice.isPending ? (
        <Skeleton height={260} />
      ) : notice.isError ? (
        <ErrorState error={notice.error} onRetry={() => void notice.refetch()} />
      ) : n ? (
        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 32 }}>
          <View style={styles.meta}>
            <StatusChip tone={n.kind === 'official' ? 'official' : 'neutral'} label={t(KIND_KEY[n.kind])} />
            <Text variant="caption" color="textMuted">
              {bsDate(n.publishedAt, locale)}
            </Text>
          </View>
          <Text variant="h2" role="heading">
            {localized(n.title, locale)}
          </Text>
          {doc ? <RichText doc={doc} media={n.media} /> : null}
          {n.attachments?.length ? (
            <View style={{ gap: 8, marginTop: 8 }}>
              <Text variant="h4" role="heading">
                {t('notices.attachments')}
              </Text>
              {n.attachments.map((a) => (
                <PressableScale
                  key={a.id}
                  role="link"
                  aria-label={a.name}
                  onPress={() =>
                    router.push({
                      pathname: '/notice-file/[noticeId]/[mediaId]',
                      params: { noticeId: n.id, mediaId: a.id, name: a.name },
                    })
                  }
                  style={[styles.file, surface]}
                >
                  <FileText size={20} color={colors.onPrimarySoft} strokeWidth={1.75} />
                  <Text variant="label" style={{ flex: 1 }} numberOfLines={2}>
                    {a.name}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {formatBytes(a.sizeBytes, locale)}
                  </Text>
                </PressableScale>
              ))}
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
});
