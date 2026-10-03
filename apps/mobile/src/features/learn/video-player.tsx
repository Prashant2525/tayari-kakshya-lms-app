import { useQuery } from '@tanstack/react-query';
import { palette } from '@tk/design-tokens';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { fetchPlayback } from '@/api/learning';
import { useT } from '@/i18n/use-t';
import { ApiError } from '@/lib/api-client';
import { ErrorState, LoadingState } from '@/ui/states';
import { Text } from '@/ui/text';
import { WebFrame } from '@/ui/web-frame';

/**
 * Phones only: the player page is the embed itself, so a small script can read the <video> element's time,
 * resume at the saved position once, and report progress every few seconds.
 */
function trackingScript(resumeAt: number): string {
  return `(function () {
  var resumed = ${resumeAt > 0 ? 'false' : 'true'}, last = -1;
  setInterval(function () {
    var v = document.querySelector('video');
    if (!v || !v.duration || !isFinite(v.duration)) return;
    if (!resumed && v.readyState > 0) { resumed = true; try { v.currentTime = ${Math.floor(resumeAt)}; } catch (e) {} }
    var t = Math.floor(v.currentTime);
    if (t !== last && (Math.abs(t - last) >= 10 || v.ended)) {
      last = t;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'time', position: t, duration: Math.floor(v.duration), ended: v.ended }));
    }
  }, 2000);
})(); true;`;
}

/** Video lesson: signed Bunny embed or privacy-enhanced YouTube (T-031), fetched fresh each time it opens. */
export function VideoPlayer({
  itemId,
  title,
  resumeAt,
  onTime,
}: {
  itemId: string;
  title: string;
  resumeAt: number;
  onTime: (position: number, duration: number, ended: boolean) => void;
}) {
  const { t } = useT();
  // Signed links expire in minutes: never reuse a cached one.
  const playback = useQuery({
    queryKey: ['playback', itemId],
    queryFn: () => fetchPlayback(itemId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const onMessage = useCallback(
    (raw: unknown) => {
      const m = raw as { type?: string; position?: number; duration?: number; ended?: boolean };
      if (m?.type === 'time' && typeof m.position === 'number' && typeof m.duration === 'number') {
        onTime(m.position, m.duration, Boolean(m.ended));
      }
    },
    [onTime],
  );

  if (playback.isPending) return <LoadingState />;
  if (playback.isError) {
    const e = playback.error;
    if (e instanceof ApiError && (e.status === 409 || e.code === 'VIDEO_PROVIDER_NOT_CONFIGURED')) {
      return (
        <View style={styles.message}>
          <Text variant="body" color="textSecondary" align="center">
            {e.status === 409 ? t('learn.videoProcessing') : t('learn.videoUnavailable')}
          </Text>
        </View>
      );
    }
    return <ErrorState error={e} onRetry={() => void playback.refetch()} />;
  }
  return (
    <View style={styles.player}>
      <WebFrame
        uri={playback.data.embedUrl}
        title={title}
        onMessage={onMessage}
        injectedJavaScript={trackingScript(resumeAt)}
        sendReferrer={playback.data.provider === 'youtube'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  player: { width: '100%', aspectRatio: 16 / 9, backgroundColor: palette.ink900 },
  message: { padding: 24, alignItems: 'center' },
});
