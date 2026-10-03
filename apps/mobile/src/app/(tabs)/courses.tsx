import { ScrollView, StyleSheet } from 'react-native';
import { MyCourses } from '@/features/courses/my-courses';
import { useT } from '@/i18n/use-t';
import { Screen } from '@/ui/layout';
import { Text } from '@/ui/text';

/** Foundation version: the student's own courses. The catalog and course detail come in §9. */
export default function CoursesScreen() {
  const { t } = useT();
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <ScrollView contentContainerStyle={styles.list}>
        <Text variant="h1" role="heading">
          {t('home.myCourses')}
        </Text>
        <MyCourses />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 0 },
  list: { padding: 20, gap: 16, flexGrow: 1 },
});
