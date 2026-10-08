import { radius } from '@tk/design-tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight, Lock, ShieldAlert } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useItem, useOutline, useSaveProgress, type ItemContent, type OutlineItem } from '@/api/learning';
import type { NewCertificate } from '@/api/certificates';
import { PdfReader } from '@/features/learn/pdf-reader';
import { BookmarkButton } from '@/features/practice/bookmark-button';
import { RichText } from '@/features/learn/rich-text';
import { VideoPlayer } from '@/features/learn/video-player';
import { localized, type Locale } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { track } from '@/lib/analytics';
import { studySignal, useStudyTime } from '@/lib/study-time';
import { ApiError } from '@/lib/api-client';
import { READER_SCALES, usePrefs } from '@/state/prefs';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { StatusChip } from '@/ui/chip';
import { Dialog } from '@/ui/dialog';
import { BackButton, Skeleton } from '@/ui/layout';
import { Segmented } from '@/ui/segmented';
import { EmptyState, ErrorState, OfflineBanner } from '@/ui/states';
import { Text } from '@/ui/text';

/** One lesson: note, PDF or video, with progress saving and previous / next within the subject. */
export default function LearnScreen() {
  const params = useLocalSearchParams<{
    itemId: string;
    courseId?: string;
    subjectId?: string;
    slug?: string;
  }>();
  const { itemId } = params;
  const courseId = params.courseId || undefined;
  const { colors } = useTheme();
  const { t, locale } = useT();
  const item = useItem(itemId);
  const outline = useOutline(courseId ?? '', params.subjectId ?? '');
  const save = useSaveProgress(itemId);
  useStudyTime(item.data ? (item.data.type === 'video' ? 'video' : 'reading') : null);

  // Lesson order within the subject (outline order), for previous / next and the saved state.
  const ordered = useMemo<OutlineItem[]>(
    () => outline.data?.chapters.flatMap((c) => c.topics.flatMap((tp) => tp.items)) ?? [],
    [outline.data],
  );
  const index = ordered.findIndex((i) => i.id === itemId);
  const saved = index >= 0 ? ordered[index]?.progress : null;
  const [done, setDone] = useState(false);
  const finished = done || Boolean(saved?.completed);
  const [earned, setEarned] = useState<NewCertificate[]>([]);

  const record = useCallback(
    (input: { position?: number; completed?: true }) =>
      save.mutate(
        { ...(courseId ? { courseId } : {}), ...input },
        {
          onSuccess: (r) => {
            if (r.completed) setDone(true);
            if (r.newCertificates.length) setEarned(r.newCertificates);
          },
        },
      ),
    [save, courseId],
  );

  const openedId = item.data?.id;
  const openedType = item.data?.type;
  useEffect(() => {
    if (openedId && openedType) track('lesson_opened', { item_id: openedId, type: openedType });
  }, [openedId, openedType]);

  // Opening a note counts as starting it (Home → Continue). PDFs and videos report positions themselves.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !item.data || item.data.type !== 'note' || saved?.completed) return;
    started.current = true;
    record({ position: 0 });
  }, [item.data, saved, record]);

  const open = (target: OutlineItem | undefined) =>
    target &&
    router.replace({
      pathname: '/learn/[itemId]',
      params: {
        itemId: target.id,
        courseId: courseId ?? '',
        subjectId: params.subjectId ?? '',
        slug: params.slug ?? '',
      },
    });

  const title = item.data ? localized(item.data.title, locale) : '';
  const error = item.error instanceof ApiError ? item.error : null;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.fill, { backgroundColor: colors.bg }]}>
      <OfflineBanner />
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <BackButton />
        <Text variant="h4" role="heading" numberOfLines={2} style={{ flex: 1 }}>
          {title}
        </Text>
        {item.data?.type === 'note' ? <TextSizeButtons /> : null}
        {item.data ? <BookmarkButton type="learning_item" id={item.data.id} /> : null}
      </View>

      {item.isPending ? (
        <View style={{ padding: 20, gap: 12 }} aria-busy>
          <Skeleton height={24} width="60%" />
          <Skeleton height={120} />
        </View>
      ) : error?.code === 'CONTENT_LOCKED' ? (
        <EmptyState
          icon={Lock}
          title={t('learn.lockedTitle')}
          body={t('learn.lockedBody')}
          action={
            params.slug ? (
              <Button
                label={t('learn.seeCourse')}
                onPress={() =>
                  router.push({ pathname: '/course/[slug]', params: { slug: params.slug as string } })
                }
              />
            ) : undefined
          }
        />
      ) : error?.code === 'VERIFICATION_REQUIRED' ? (
        <EmptyState
          icon={ShieldAlert}
          title={t('learn.verifyTitle')}
          action={<Button label={t('learn.verifyAction')} onPress={() => router.push('/verify')} />}
        />
      ) : item.isError ? (
        <ErrorState error={item.error} onRetry={() => void item.refetch()} />
      ) : (
        <Body
          item={item.data}
          title={title}
          locale={locale}
          startAt={saved?.position ?? 0}
          finished={finished}
          onPosition={(position, total) =>
            record(total && position >= total && !finished ? { position, completed: true } : { position })
          }
        />
      )}

      {item.data ? (
        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <NavButton direction="previous" disabled={index <= 0} onPress={() => open(ordered[index - 1])} />
          {finished ? (
            <View style={styles.finished}>
              <StatusChip tone="done" label={t('learn.finished')} />
            </View>
          ) : (
            <Button
              label={t('learn.markDone')}
              size="md"
              loading={save.isPending}
              onPress={() => record({ completed: true })}
              style={{ flex: 1 }}
            />
          )}
          <NavButton
            direction="next"
            disabled={index < 0 || index >= ordered.length - 1}
            onPress={() => open(ordered[index + 1])}
          />
        </View>
      ) : null}

      <Dialog visible={earned.length > 0} title={t('cert.earnedTitle')} onClose={() => setEarned([])}>
        <Text variant="body" color="textSecondary">
          {t('cert.earnedBody', {
            course: earned.map((c) => localized(c.course.title, locale)).join(', '),
          })}
        </Text>
        <Button
          label={t('cert.view')}
          onPress={() => {
            setEarned([]);
            router.push('/certificates');
          }}
        />
        <Button label={t('cert.later')} variant="secondary" onPress={() => setEarned([])} />
      </Dialog>
    </SafeAreaView>
  );
}

function Body({
  item,
  title,
  locale,
  startAt,
  finished,
  onPosition,
}: {
  item: ItemContent;
  title: string;
  locale: Locale;
  startAt: number;
  finished: boolean;
  onPosition: (position: number, total?: number) => void;
}) {
  const lastVideoSave = useRef(-1);
  if (item.type === 'pdf') {
    return (
      <PdfReader
        itemId={item.id}
        startPage={Math.max(1, startAt)}
        onPage={(page, count) => {
          // Touches inside the PDF view may not reach the app: turning a page counts as reading.
          studySignal('touch');
          onPosition(page, count);
        }}
      />
    );
  }
  if (item.type === 'video') {
    return (
      <ScrollView>
        <VideoPlayer
          itemId={item.id}
          title={title}
          resumeAt={finished ? 0 : startAt}
          onTime={(position, duration, ended) => {
            // The player reports while the video plays: study time counts (D-066).
            if (!ended) studySignal('media');
            // Save every 15 s, and once the student reaches 90 % (counted as watched).
            const nearlyDone = ended || position >= duration * 0.9;
            if (nearlyDone || Math.abs(position - lastVideoSave.current) >= 15) {
              lastVideoSave.current = position;
              onPosition(position, nearlyDone ? position : undefined);
            }
          }}
        />
      </ScrollView>
    );
  }
  return <NoteBody item={item} locale={locale} />;
}

function NoteBody({ item, locale }: { item: ItemContent; locale: Locale }) {
  const { t } = useT();
  const scale = READER_SCALES[usePrefs((s) => s.readerScale)] ?? 1;
  const available = (['en', 'ne'] as const).filter((l) => item.noteContent?.[l]);
  const [lang, setLang] = useState<'en' | 'ne'>(
    available.includes(locale) ? locale : (available[0] ?? locale),
  );
  const doc = item.noteContent?.[lang];
  return (
    <ScrollView contentContainerStyle={styles.note}>
      {available.length > 1 ? (
        <Segmented
          label={t('learn.readIn')}
          value={lang}
          options={[
            { value: 'en', label: t('lang.en') },
            { value: 'ne', label: t('lang.ne') },
          ]}
          onChange={setLang}
        />
      ) : null}
      {doc ? (
        <RichText doc={doc} media={item.media ?? {}} scale={scale} />
      ) : (
        <Text variant="body" color="textSecondary">
          {t('learn.empty')}
        </Text>
      )}
    </ScrollView>
  );
}

function TextSizeButtons() {
  const { colors } = useTheme();
  const { t } = useT();
  const index = usePrefs((s) => s.readerScale);
  const set = usePrefs((s) => s.setReaderScale);
  return (
    <View style={styles.sizes}>
      {[
        { label: 'A−', a11y: t('learn.smaller'), next: index - 1, disabled: index <= 0, size: 14 },
        {
          label: 'A+',
          a11y: t('learn.larger'),
          next: index + 1,
          disabled: index >= READER_SCALES.length - 1,
          size: 18,
        },
      ].map((b) => (
        <Pressable
          key={b.label}
          role="button"
          aria-label={b.a11y}
          aria-disabled={b.disabled}
          disabled={b.disabled}
          onPress={() => set(b.next)}
          style={[styles.sizeButton, { opacity: b.disabled ? 0.4 : 1 }]}
        >
          <Text variant="label" style={{ fontSize: b.size, color: colors.text }}>
            {b.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function NavButton({
  direction,
  disabled,
  onPress,
}: {
  direction: 'previous' | 'next';
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useT();
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      role="button"
      aria-label={t(direction === 'previous' ? 'learn.previous' : 'learn.next')}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={[styles.nav, { borderColor: colors.borderStrong, opacity: disabled ? 0.4 : 1 }]}
    >
      <Icon size={22} color={colors.text} strokeWidth={1.75} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  note: { padding: 20, gap: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  sizes: { flexDirection: 'row' },
  sizeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  finished: { flex: 1, alignItems: 'center' },
  nav: {
    width: 48,
    height: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
