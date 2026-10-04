import { radius } from '@tk/design-tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { BookOpen, ChevronRight, FileText, Lock, PlayCircle } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCourse, useEnrol, type CourseDetail } from '@/api/learning';
import { CourseArt, PriceText } from '@/features/courses/course-card';
import { RichText } from '@/features/learn/rich-text';
import { TestsLink } from '@/features/tests/tests-link';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { bsDate } from '@/lib/dates';
import { errorMessageKey } from '@/lib/error-message';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { StatusChip } from '@/ui/chip';
import { BackButton, Banner, Card, Skeleton } from '@/ui/layout';
import { ErrorState, OfflineBanner } from '@/ui/states';
import { Text } from '@/ui/text';

/** Course detail: what is inside, subjects, teachers, and the access action (Enrol / start / price). */
export default function CourseScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
  const { t, locale } = useT();
  const course = useCourse(slug);

  if (course.isPending) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]}>
        <View style={{ padding: 20, gap: 12 }} aria-busy>
          <Skeleton height={180} />
          <Skeleton height={28} width="70%" />
          <Skeleton height={64} />
        </View>
      </SafeAreaView>
    );
  }
  if (course.isError) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]}>
        <View style={styles.topBar}>
          <BackButton />
        </View>
        <ErrorState error={course.error} onRetry={() => void course.refetch()} />
      </SafeAreaView>
    );
  }
  const c = course.data;
  const title = localized(c.title, locale);
  const description = c.description ? (c.description[locale] ?? c.description.en ?? c.description.ne) : null;
  const counts = [
    c.contentCounts.note
      ? { Icon: BookOpen, label: t('course.countNote', { count: c.contentCounts.note }) }
      : null,
    c.contentCounts.pdf
      ? { Icon: FileText, label: t('course.countPdf', { count: c.contentCounts.pdf }) }
      : null,
    c.contentCounts.video
      ? { Icon: PlayCircle, label: t('course.countVideo', { count: c.contentCounts.video }) }
      : null,
  ].filter((x) => x !== null);
  const validity =
    c.validity.type === 'days' && c.validity.days
      ? t('course.validityDays', { days: c.validity.days })
      : c.validity.type === 'fixed_date' && c.validity.endsOn
        ? t('course.validityUntil', { date: bsDate(`${c.validity.endsOn}T00:00:00+05:45`, locale) })
        : c.validity.type === 'lifetime'
          ? t('course.validityLifetime')
          : null;

  return (
    <SafeAreaView edges={['top']} style={[styles.fill, { backgroundColor: colors.bg }]}>
      <OfflineBanner />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View>
          <CourseArt title={title} uri={c.thumbnailUrl} style={styles.hero} size="lg" />
          <BackButton style={styles.heroBack} />
        </View>
        <View style={styles.body}>
          <View style={{ gap: 4 }}>
            {c.examNodes.length ? (
              <Text variant="label" color="textSecondary">
                {c.examNodes.map((n) => localized(n.name, locale)).join(' · ')}
              </Text>
            ) : null}
            <Text variant="h2" role="heading">
              {title}
            </Text>
            {c.shortDescription ? (
              <Text variant="body" color="textSecondary">
                {localized(c.shortDescription, locale)}
              </Text>
            ) : null}
            {validity ? (
              <Text variant="bodySm" color="textMuted">
                {validity}
              </Text>
            ) : null}
          </View>

          {counts.length ? (
            <View style={styles.counts}>
              {counts.map(({ Icon, label }) => (
                <View
                  key={label}
                  style={[styles.count, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Icon size={18} color={colors.onPrimarySoft} strokeWidth={1.75} />
                  <Text variant="bodySm">{label}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            <Text variant="h4" role="heading">
              {t('course.subjects')}
            </Text>
            {c.subjects.map((s, i) => (
              <SubjectRow key={s.id} course={c} subject={s} index={i} />
            ))}
          </View>

          <TestsLink title={t('tests.title')} courseId={c.id} />

          {description ? (
            <View style={{ gap: 8 }}>
              <Text variant="h4" role="heading">
                {t('course.about')}
              </Text>
              <RichText doc={description} media={c.descriptionMedia} scale={0.94} />
            </View>
          ) : null}

          {c.instructors.length ? (
            <View style={{ gap: 8 }}>
              <Text variant="h4" role="heading">
                {t('course.teachers')}
              </Text>
              {c.instructors.map((i) => (
                <Card key={i.id} style={{ gap: 2 }}>
                  <Text variant="label">{localized(i.displayName, locale)}</Text>
                  {i.bio ? (
                    <Text variant="bodySm" color="textSecondary">
                      {localized(i.bio, locale)}
                    </Text>
                  ) : null}
                </Card>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
      <AccessBar
        course={c}
        slug={slug}
        refresh={() => void course.refetch()}
        refreshing={course.isFetching}
      />
    </SafeAreaView>
  );
}

function SubjectRow({
  course,
  subject,
  index,
}: {
  course: CourseDetail;
  subject: CourseDetail['subjects'][number];
  index: number;
}) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const name = localized(subject.name, locale);
  const meta = [
    subject.fullMarks !== null && subject.passMarks !== null
      ? t('course.marks', { full: subject.fullMarks, pass: subject.passMarks })
      : null,
    subject.durationMinutes ? t('course.minutes', { minutes: subject.durationMinutes }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      role="link"
      aria-label={name}
      onPress={() =>
        router.push({
          pathname: '/subject/[courseId]/[subjectId]',
          params: { courseId: course.id, subjectId: subject.id, slug: course.slug },
        })
      }
      style={({ pressed }) => [
        styles.subject,
        { backgroundColor: pressed ? colors.surfaceMuted : colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={[styles.index, { backgroundColor: colors.primarySoft }]}>
        <Text variant="label" color="onPrimarySoft">
          {index + 1}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="h4">{name}</Text>
        {meta ? (
          <Text variant="caption" color="textSecondary">
            {meta}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />
    </Pressable>
  );
}

/**
 * The access action. Entitled → start; free → Enrol (D-043); paid where this platform sells → price (checkout is §11);
 * no price (iOS, D-027) → a neutral note without prices or purchase links.
 */
function AccessBar({
  course,
  slug,
  refresh,
  refreshing,
}: {
  course: CourseDetail;
  slug: string;
  refresh: () => void;
  refreshing: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useT();
  const enrol = useEnrol(slug);
  const first = course.subjects[0];
  const start = () =>
    first &&
    router.push({
      pathname: '/subject/[courseId]/[subjectId]',
      params: { courseId: course.id, subjectId: first.id, slug: course.slug },
    });

  let content;
  if (course.access?.entitled) {
    content = (
      <View style={{ gap: 8 }}>
        <StatusChip tone="done" label={t('course.enrolled')} />
        <Button label={t('course.start')} onPress={start} disabled={!first} />
      </View>
    );
  } else if (course.access?.canEnrol) {
    content = (
      <View style={{ gap: 8 }}>
        {enrol.isError ? <Banner message={t(errorMessageKey(enrol.error))} /> : null}
        <Button label={t('course.enrol')} loading={enrol.isPending} onPress={() => enrol.mutate(course.id)} />
      </View>
    );
  } else if (course.pricing) {
    content = (
      <View style={styles.priceBar}>
        <PriceText course={course} />
        <Text variant="bodySm" color="textSecondary" style={{ flex: 1, textAlign: 'right' }}>
          {t('course.buySoon')}
        </Text>
      </View>
    );
  } else {
    content = (
      <View style={styles.priceBar}>
        <Lock size={20} color={colors.textSecondary} strokeWidth={1.75} />
        <Text variant="bodySm" color="textSecondary" style={{ flex: 1 }}>
          {t('course.lockedNoPrice')}
        </Text>
        <Button
          label={t('course.refresh')}
          variant="secondary"
          size="md"
          loading={refreshing}
          onPress={refresh}
        />
      </View>
    );
  }
  return (
    <SafeAreaView
      edges={['bottom']}
      style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}
    >
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { paddingHorizontal: 20, paddingTop: 8 },
  scroll: { paddingBottom: 24 },
  hero: { width: '100%', height: 200 },
  heroBack: {
    position: 'absolute',
    top: 8,
    left: 16,
    marginLeft: 0,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  body: { padding: 20, gap: 20, width: '100%', maxWidth: 640, alignSelf: 'center' },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  count: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  subject: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  index: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  priceBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
