import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { PdfReader } from '@/features/learn/pdf-reader';
import { useT } from '@/i18n/use-t';
import { BackButton, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';

/** A PDF attached to a notice (D-074 / audit F-12), in the in-app reader. */
export default function NoticeFileScreen() {
  const { noticeId, mediaId, name } = useLocalSearchParams<{
    noticeId: string;
    mediaId: string;
    name?: string;
  }>();
  const { t } = useT();
  const onPage = useCallback(() => undefined, []);
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h4" role="heading" numberOfLines={1} style={{ flex: 1 }}>
          {name || t('item.pdf')}
        </Text>
      </View>
      <PdfReader itemId={mediaId} startPage={1} onPage={onPage} notice={{ noticeId, mediaId }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: 4, paddingTop: 8, paddingHorizontal: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16 },
});
