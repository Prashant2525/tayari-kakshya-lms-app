import { useQuery } from '@tanstack/react-query';
import { palette, radius } from '@tk/design-tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { Clock, Lock, ShieldAlert, UserRound, Video } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { fetchLiveRecording, useJoinLive, useLiveClass, type LiveClassView, type LiveJoin } from '@/api/live';
import { LiveChips } from '@/features/live/live-card';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { ApiError } from '@/lib/api-client';
import { bsDateTime } from '@/lib/dates';
import { errorMessageKey } from '@/lib/error-message';
import { num } from '@/lib/format';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { BackButton, Banner, Card, Screen, Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { Text } from '@/ui/text';
import { WebFrame } from '@/ui/web-frame';

/**
 * One live class (D-072): when and who, then Join — YouTube plays here, Zoom opens in the Zoom app with the passcode
 * shown. Afterwards, the recording. The link only ever comes from Join, which also records attendance.
 */
export default function LiveClassScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useT();
  const live = useLiveClass(id);
  const l = live.data;
  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
      </View>
      {live.isPending ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={200} />
          <Skeleton height={28} width="70%" />
        </View>
      ) : live.isError ? (
        <ErrorState error={live.error} onRetry={() => void live.refetch()} />
      ) : l ? (
        <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
          <View style={{ gap: 8 }}>
            <LiveChips live={l} />
            <Text variant="h2" role="heading">
              {localized(l.title, locale)}
            </Text>
            <Text
              variant="label"
              color="link"
              role="link"
              onPress={() => router.push({ pathname: '/course/[slug]', params: { slug: l.course.slug } })}
            >
              {localized(l.course.title, locale)}
            </Text>
          </View>
          <Facts live={l} />
          <Action key={`${l.status}${l.canJoin}`} live={l} refresh={() => void live.refetch()} />
          {l.description ? (
            <View style={{ gap: 6 }}>
              <Text variant="h4" role="heading">
                {t('live.about')}
              </Text>
              <Text variant="body" color="textSecondary">
                {localized(l.description, locale)}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

function Facts({ live: l }: { live: LiveClassView }) {
  const { colors } = useTheme();
  const { t, locale } = useT();
  const rows = [
    {
      Icon: Clock,
      text: `${bsDateTime(l.startsAt, locale)} · ${t('live.minutes', { n: num(l.durationMinutes, locale) })}`,
    },
    { Icon: Video, text: l.provider === 'zoom' ? t('live.onZoom') : t('live.onYouTube') },
    l.instructor ? { Icon: UserRound, text: l.instructor.name } : null,
  ].filter((x) => x !== null);
  return (
    <Card style={{ gap: 10 }}>
      {rows.map(({ Icon, text }) => (
        <View key={text} style={styles.fact}>
          <Icon size={18} color={colors.onPrimarySoft} strokeWidth={1.75} />
          <Text variant="body" style={{ flex: 1 }}>
            {text}
          </Text>
        </View>
      ))}
    </Card>
  );
}

/** What the student can do now: join, wait for it to open, watch the recording — or why not. */
function Action({ live: l, refresh }: { live: LiveClassView; refresh: () => void }) {
  const { t, locale } = useT();
  const join = useJoinLive(l.id);
  const [joined, setJoined] = useState<LiveJoin | null>(null);
  const [watch, setWatch] = useState(false);
  const title = localized(l.title, locale);

  if (l.status === 'cancelled') return <Banner tone="warning" message={t('live.cancelledBody')} />;
  if (!l.access) {
    return (
      <EmptyState
        icon={Lock}
        title={t('live.lockedTitle')}
        body={t('live.lockedBody')}
        action={
          <Button
            label={t('live.seeCourse')}
            onPress={() => router.push({ pathname: '/course/[slug]', params: { slug: l.course.slug } })}
          />
        }
      />
    );
  }
  if (l.status === 'ended') {
    if (!l.hasRecording) return <Banner tone="info" message={t('live.noRecording')} />;
    return watch ? (
      <Recording id={l.id} title={title} />
    ) : (
      <Button label={t('live.watchRecording')} onPress={() => setWatch(true)} />
    );
  }

  if (joined?.provider === 'youtube') {
    return (
      <View style={styles.player}>
        <WebFrame uri={joined.embedUrl} title={title} sendReferrer />
      </View>
    );
  }
  if (joined?.provider === 'zoom') {
    return (
      <Card style={{ gap: 10 }}>
        <Text variant="h4">{t('live.zoomReady')}</Text>
        {joined.passcode ? (
          <View style={{ gap: 2 }}>
            <Text variant="caption" color="textSecondary">
              {t('live.passcode')}
            </Text>
            <Text variant="h3" selectable>
              {joined.passcode}
            </Text>
          </View>
        ) : null}
        <Button label={t('live.openZoom')} onPress={() => void Linking.openURL(joined.joinUrl)} />
      </Card>
    );
  }

  const error = join.error instanceof ApiError ? join.error : null;
  if (error?.code === 'VERIFICATION_REQUIRED') {
    return (
      <EmptyState
        icon={ShieldAlert}
        title={t('learn.verifyTitle')}
        action={<Button label={t('learn.verifyAction')} onPress={() => router.push('/verify')} />}
      />
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {join.isError ? (
        <Banner
          message={error?.code === 'LIVE_CLASS_CLOSED' ? t('live.notOpen') : t(errorMessageKey(join.error))}
        />
      ) : null}
      {!l.canJoin ? (
        <Banner tone="info" message={t('live.opensAt', { time: bsDateTime(l.joinOpensAt, locale) })} />
      ) : null}
      <Button
        label={l.provider === 'zoom' ? t('live.joinZoom') : t('live.watchLive')}
        disabled={!l.canJoin}
        loading={join.isPending}
        onPress={() =>
          join.mutate(undefined, {
            onSuccess: (res) => {
              setJoined(res);
              // Without a passcode to note down, go straight to Zoom.
              if (res.provider === 'zoom' && !res.passcode) void Linking.openURL(res.joinUrl);
            },
            onError: (e) => {
              if (e instanceof ApiError && e.code === 'LIVE_CLASS_CLOSED') refresh();
            },
          })
        }
      />
    </View>
  );
}

function Recording({ id, title }: { id: string; title: string }) {
  // Signed links expire in minutes: never reuse a cached one.
  const playback = useQuery({
    queryKey: ['live', 'recording', id],
    queryFn: () => fetchLiveRecording(id),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  if (playback.isPending) return <LoadingState />;
  if (playback.isError) return <ErrorState error={playback.error} onRetry={() => void playback.refetch()} />;
  return (
    <View style={styles.player}>
      <WebFrame
        uri={playback.data.embedUrl}
        title={title}
        sendReferrer={playback.data.provider === 'youtube'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center' },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  player: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: palette.ink900,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
});
