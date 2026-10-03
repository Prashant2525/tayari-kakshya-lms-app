import { radius } from '@tk/design-tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { BookOpen, ChevronDown, FileText, PlayCircle } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useOutline, type OutlineItem, type SubjectOutline } from '@/api/learning';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { formatDuration } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { StatusChip } from '@/ui/chip';
import { PracticeList } from '@/features/practice/practice-list';
import { BackButton, Screen, Skeleton } from '@/ui/layout';
import { Segmented } from '@/ui/segmented';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';

type Tab = 'notes' | 'videos' | 'questions';
const inTab = (item: OutlineItem, tab: Tab) =>
  tab === 'videos' ? item.type === 'video' : item.type !== 'video';

/** Subject outline (DESIGN_SYSTEM §8): chapters → topics → lessons, each with its state. */
export default function SubjectScreen() {
  const { courseId, subjectId, slug } = useLocalSearchParams<{
    courseId: string;
    subjectId: string;
    slug?: string;
  }>();
  const { t, locale } = useT();
  const outline = useOutline(courseId, subjectId);
  const [tab, setTab] = useState<Tab>('notes');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const items = outline.data?.chapters.flatMap((c) => c.topics.flatMap((tp) => tp.items)) ?? [];
  const done = items.filter((i) => i.progress?.completed).length;
  const chapters = (outline.data?.chapters ?? [])
    .map((c) => ({
      ...c,
      topics: c.topics.map((tp) => ({ ...tp, items: tp.items.filter((i) => inTab(i, tab)) })),
    }))
    .filter((c) => c.topics.some((tp) => tp.items.length));

  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <View style={{ flex: 1 }}>
          <Text variant="h3" role="heading" numberOfLines={2}>
            {outline.data ? localized(outline.data.name, locale) : ' '}
          </Text>
          {items.length ? (
            <Text variant="bodySm" color="textSecondary">
              {t('subject.progress', { done, total: items.length })}
            </Text>
          ) : null}
        </View>
      </View>
      <Segmented
        label={t('course.subjects')}
        value={tab}
        options={[
          { value: 'notes', label: t('subject.notes') },
          { value: 'videos', label: t('subject.videos') },
          { value: 'questions', label: t('subject.questions') },
        ]}
        onChange={setTab}
      />
      {tab === 'questions' ? (
        <PracticeList courseId={courseId} subjectId={subjectId} courseSlug={slug} />
      ) : outline.isPending ? (
        <View style={{ gap: 10, marginTop: 14 }} aria-busy>
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : outline.isError ? (
        <ErrorState error={outline.error} onRetry={() => void outline.refetch()} />
      ) : chapters.length === 0 ? (
        <EmptyState icon={BookOpen} title={t('subject.empty')} body={t('subject.emptyBody')} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {chapters.map((chapter, ci) => (
            <Chapter
              key={chapter.id}
              chapter={chapter}
              expanded={open[chapter.id] ?? ci === 0}
              onToggle={() => setOpen((o) => ({ ...o, [chapter.id]: !(o[chapter.id] ?? ci === 0) }))}
              onOpen={(item) =>
                router.push({
                  pathname: '/learn/[itemId]',
                  params: { itemId: item.id, courseId, subjectId, slug: slug ?? '' },
                })
              }
            />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

function Chapter({
  chapter,
  expanded,
  onToggle,
  onOpen,
}: {
  chapter: SubjectOutline['chapters'][number];
  expanded: boolean;
  onToggle: () => void;
  onOpen: (item: OutlineItem) => void;
}) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const items = chapter.topics.flatMap((tp) => tp.items);
  const done = items.filter((i) => i.progress?.completed).length;
  const title = [chapter.numberLabel, localized(chapter.title, locale)].filter(Boolean).join('. ');
  return (
    <View style={[styles.chapter, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable role="button" aria-expanded={expanded} onPress={onToggle} style={styles.chapterHead}>
        <View style={{ flex: 1 }}>
          <Text variant="h4">{title}</Text>
          <Text variant="caption" color="textSecondary">
            {t('subject.progress', { done, total: items.length })}
          </Text>
        </View>
        <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
          <ChevronDown size={20} color={colors.textSecondary} strokeWidth={1.75} />
        </View>
      </Pressable>
      {expanded
        ? chapter.topics
            .filter((tp) => tp.items.length)
            .map((topic) => (
              <View key={topic.id} style={[styles.topic, { borderTopColor: colors.border }]}>
                <Text variant="label" color="textSecondary">
                  {[topic.numberLabel, localized(topic.title, locale)].filter(Boolean).join(' ')}
                </Text>
                {topic.items.map((item) => (
                  <ItemRow key={item.id} item={item} onPress={() => onOpen(item)} />
                ))}
              </View>
            ))
        : null}
    </View>
  );
}

function ItemRow({ item, onPress }: { item: OutlineItem; onPress: () => void }) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const Icon = item.type === 'video' ? PlayCircle : item.type === 'pdf' ? FileText : BookOpen;
  const title = localized(item.title, locale);
  const meta =
    item.type === 'video' && item.durationSeconds
      ? formatDuration(item.durationSeconds, locale)
      : item.type === 'pdf' && item.pageCount
        ? t('item.pages', { count: item.pageCount })
        : t(`item.${item.type}`);
  const chip = item.locked
    ? { tone: 'premium' as const, label: t('item.premium') }
    : item.progress?.completed
      ? { tone: 'done' as const, label: t('item.done') }
      : item.progress
        ? {
            tone: 'progress' as const,
            label:
              item.type === 'pdf' && item.progress.position && item.pageCount
                ? t('item.pageOf', { page: item.progress.position, total: item.pageCount })
                : t('item.inProgress'),
          }
        : null;
  return (
    <Pressable
      role="link"
      aria-label={title}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      <Icon size={20} color={item.locked ? colors.textMuted : colors.onPrimarySoft} strokeWidth={1.75} />
      <View style={{ flex: 1 }}>
        <Text variant="body" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="caption" color="textMuted">
          {meta}
        </Text>
      </View>
      {chip ? <StatusChip tone={chip.tone} label={chip.label} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  list: { gap: 10, paddingBottom: 24 },
  chapter: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  chapterHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 56 },
  topic: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 2,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
});
