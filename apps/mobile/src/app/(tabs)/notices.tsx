import { Megaphone } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { useT } from '@/i18n/use-t';
import { Screen } from '@/ui/layout';
import { EmptyState } from '@/ui/states';
import { Text } from '@/ui/text';

/** Notices (D-019) need the notices API (IMPLEMENTATION_PLAN §12); until then the tab shows its empty state. */
export default function NoticesScreen() {
  const { t } = useT();
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <Text variant="h1" role="heading">
        {t('notices.title')}
      </Text>
      <EmptyState icon={Megaphone} title={t('notices.empty')} body={t('notices.emptyBody')} />
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { paddingTop: 20 } });
