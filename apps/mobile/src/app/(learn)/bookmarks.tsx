import { Bookmark } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useBookmarks } from '@/api/learning';
import { ResultRow } from '@/features/practice/result-rows';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { BackButton, Screen, Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** Saved lessons and questions, newest first (Profile → Saved). */
export default function BookmarksScreen() {
  const { t, locale } = useT();
  const bookmarks = useBookmarks();
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {t('bookmarks.title')}
        </Text>
      </View>
      {bookmarks.isPending ? (
        <View style={{ gap: 10 }} aria-busy>
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : bookmarks.isError ? (
        <ErrorState error={bookmarks.error} onRetry={() => void bookmarks.refetch()} />
      ) : bookmarks.data.length === 0 ? (
        <EmptyState icon={Bookmark} title={t('bookmarks.empty')} body={t('bookmarks.emptyBody')} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {bookmarks.data.map((b) => (
            <ResultRow
              key={`${b.targetType}:${b.id}`}
              kind={b.targetType === 'question' ? 'question' : b.itemType}
              id={b.id}
              title={b.targetType === 'question' ? b.preview : localized(b.title, locale)}
              subtitle={localized(b.subject.name, locale)}
            />
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
});
