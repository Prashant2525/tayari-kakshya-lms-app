import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { usePage } from '@/api/support';
import { RichText } from '@/features/learn/rich-text';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDate } from '@/lib/dates';
import { BackButton, Screen, Skeleton } from '@/ui/layout';
import { ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** About, Terms, Privacy or Refund (D-038): the last published version. */
export default function PageScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, locale } = useT();
  const page = usePage(slug);
  const p = page.data;
  const doc = p ? (p.body[locale] ?? p.body.en ?? p.body.ne) : undefined;
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
      </View>
      {page.isPending ? (
        <Skeleton height={320} />
      ) : page.isError ? (
        <ErrorState error={page.error} onRetry={() => void page.refetch()} />
      ) : p ? (
        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 32 }}>
          <Text variant="h2" role="heading">
            {localized(p.title, locale)}
          </Text>
          <Text variant="caption" color="textMuted">
            {t('pages.updated', { date: bsDate(p.publishedAt, locale) })}
          </Text>
          {doc ? <RichText doc={doc} media={p.media} /> : null}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center' },
});
