import { radius } from '@tk/design-tokens';
import { router } from 'expo-router';
import { ChevronRight, History } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAssessments, type AssessmentSummary } from '@/api/assessments';
import { usePyqFilters } from '@/api/learning';
import { useNotices } from '@/api/notices';
import { NoticeCard } from '@/features/notices/notice-card';
import { TestRow } from '@/features/tests/test-list';
import { useT } from '@/i18n/use-t';
import { useTheme } from '@/theme/theme';
import { useSurfaceStyle } from '@/ui/layout';
import { PressableScale } from '@/ui/motion';
import { Text } from '@/ui/text';

const EXAM_TYPES: ReadonlyArray<AssessmentSummary['type']> = ['weekly', 'mock', 'pyq_mock'];

function SectionHead({ title, onAll }: { title: string; onAll: () => void }) {
  const { t } = useT();
  return (
    <View style={styles.head}>
      <Text variant="h4" role="heading" style={{ flex: 1 }}>
        {title}
      </Text>
      <Pressable role="link" hitSlop={12} onPress={onAll}>
        <Text variant="label" color="link">
          {t('live.seeAll')}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Home: the exams coming up for the student's exams and courses (D-074 / audit F-07) — weekly, mock and previous-year
 * mock exams that are open or about to open and not yet taken; open ones first. Hidden when there are none.
 */
export function UpcomingExams() {
  const { t } = useT();
  const list = useAssessments({ mine: true });
  const exams = (list.data?.data ?? [])
    .filter((a) => EXAM_TYPES.includes(a.type) && a.state !== 'closed' && a.attemptsUsed === 0)
    .sort(
      (x, y) =>
        Number(x.state !== 'open') - Number(y.state !== 'open') ||
        Date.parse(x.opensAt ?? '0') - Date.parse(y.opensAt ?? '0'),
    )
    .slice(0, 3);
  if (!exams.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <SectionHead title={t('home.upcomingExams')} onAll={() => router.push('/tests')} />
      {exams.map((a) => (
        <TestRow key={a.id} a={a} />
      ))}
    </View>
  );
}

/** Home: the latest notices (pinned first, as in the Notice tab). Hidden when there are none. */
export function LatestNotices() {
  const { t } = useT();
  const notices = useNotices();
  const latest = (notices.data?.pages[0]?.data ?? []).slice(0, 2);
  if (!latest.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <SectionHead title={t('home.latestNotices')} onAll={() => router.push('/notices')} />
      {latest.map((n) => (
        <NoticeCard key={n.id} n={n} lines={2} />
      ))}
    </View>
  );
}

/** Home: the way into previous-year questions (D-074 / audit F-10); hidden while there are none. */
export function PyqLink() {
  const { colors } = useTheme();
  const surface = useSurfaceStyle();
  const { t } = useT();
  const filters = usePyqFilters();
  if (!filters.data || (filters.data.years.length === 0 && filters.data.examNodes.length === 0)) return null;
  return (
    <PressableScale
      role="link"
      aria-label={t('pyq.title')}
      onPress={() => router.push('/pyq')}
      style={[styles.link, surface]}
    >
      <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
        <History size={22} color={colors.onPrimarySoft} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="h4">{t('pyq.title')}</Text>
        <Text variant="bodySm" color="textSecondary">
          {t('pyq.homeBody')}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center' },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
