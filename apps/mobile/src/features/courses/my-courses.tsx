import { palette, radius } from '@tk/design-tokens';
import { BookOpen } from 'lucide-react-native';
import { Image, StyleSheet, View } from 'react-native';
import { useMyCourses, type CourseCardView } from '@/api/queries';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { useTheme } from '@/theme/theme';
import { Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

/** Courses the student can open (active entitlements), newest activity first. */
export function MyCourses() {
  const { t } = useT();
  const courses = useMyCourses();
  if (courses.isPending) {
    return (
      <View style={styles.list} aria-busy>
        <Skeleton height={88} />
        <Skeleton height={88} />
      </View>
    );
  }
  if (courses.isError) return <ErrorState error={courses.error} onRetry={() => void courses.refetch()} />;
  if (courses.data.length === 0) {
    return <EmptyState icon={BookOpen} title={t('home.noCourses')} body={t('home.noCoursesBody')} />;
  }
  return (
    <View style={styles.list}>
      {courses.data.map((c) => (
        <CourseRow key={c.id} course={c} />
      ))}
    </View>
  );
}

function CourseRow({ course }: { course: CourseCardView }) {
  const { colors } = useTheme();
  const { locale } = useT();
  const title = localized(course.title, locale);
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {course.thumbnailUrl ? (
        <Image source={{ uri: course.thumbnailUrl }} style={styles.thumb} accessibilityIgnoresInvertColors />
      ) : (
        // Branded fallback artwork instead of a black placeholder (DESIGN_SYSTEM §2).
        <View style={[styles.thumb, { backgroundColor: palette.blue500 }]}>
          <Text variant="h3" weight={700} style={{ color: palette.white }}>
            {title.slice(0, 2).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text variant="h4" numberOfLines={2}>
          {title}
        </Text>
        {course.shortDescription ? (
          <Text variant="bodySm" color="textSecondary" numberOfLines={2}>
            {localized(course.shortDescription, locale)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  thumb: { width: 64, height: 64, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
