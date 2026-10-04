import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { TestList } from '@/features/tests/test-list';
import { useT } from '@/i18n/use-t';
import { BackButton, Screen } from '@/ui/layout';
import { Text } from '@/ui/text';

/** Tests of a course (`?courseId=`), or for the student's exams and courses (Home). */
export default function TestsScreen() {
  const { t } = useT();
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="h3" role="heading">
          {courseId ? t('tests.title') : t('home.tests')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <TestList scope={courseId ? { courseId } : { mine: true }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 4, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
