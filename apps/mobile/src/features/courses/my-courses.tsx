import { BookOpen } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useCatalog, useMyCourseList, type CatalogCourse } from '@/api/learning';
import { useT } from '@/i18n/use-t';
import { Button } from '@/ui/button';
import { Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { FadeInUp } from '@/ui/motion';
import { CourseRow } from './course-card';

function Loading() {
  return (
    <View style={styles.list} aria-busy>
      <Skeleton height={96} />
      <Skeleton height={96} />
    </View>
  );
}

/** Courses the student can open (active entitlements) with their progress. */
export function MyCourses({ hideWhenEmpty = false }: { hideWhenEmpty?: boolean }) {
  const { t } = useT();
  const courses = useMyCourseList();
  if (courses.isPending) return <Loading />;
  if (courses.isError) return <ErrorState error={courses.error} onRetry={() => void courses.refetch()} />;
  if (courses.data.length === 0) {
    return hideWhenEmpty ? null : (
      <EmptyState icon={BookOpen} title={t('home.noCourses')} body={t('home.noCoursesBody')} />
    );
  }
  return (
    <View style={styles.list}>
      {courses.data.map((c, i) => (
        <FadeInUp key={c.id} index={i}>
          <CourseRow course={c} />
        </FadeInUp>
      ))}
    </View>
  );
}

/** Live courses from the CMS, optionally under one category (and its sub-categories), with paging. */
export function CatalogList({
  examNodeId,
  q,
  limit,
}: {
  examNodeId: string | null;
  q: string;
  /** Show only the first N (Home); otherwise all pages with "Show more". */
  limit?: number;
}) {
  const { t } = useT();
  const catalog = useCatalog(examNodeId, q);
  if (catalog.isPending) return <Loading />;
  if (catalog.isError) return <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />;
  const all: CatalogCourse[] = catalog.data.pages.flatMap((p) => p.data);
  const shown = limit ? all.slice(0, limit) : all;
  if (shown.length === 0) {
    return <EmptyState icon={BookOpen} title={t('courses.empty')} body={t('courses.emptyBody')} />;
  }
  return (
    <View style={styles.list}>
      {shown.map((c, i) => (
        <FadeInUp key={c.id} index={i}>
          <CourseRow course={c} />
        </FadeInUp>
      ))}
      {!limit && catalog.hasNextPage ? (
        <Button
          label={t('courses.loadMore')}
          variant="secondary"
          size="md"
          loading={catalog.isFetchingNextPage}
          onPress={() => void catalog.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ list: { gap: 10 } });
