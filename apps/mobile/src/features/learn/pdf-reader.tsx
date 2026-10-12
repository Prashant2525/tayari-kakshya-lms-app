import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n/use-t';
import { env } from '@/lib/env';
import { savedPdf } from '@/lib/offline';
import { base64Chunks } from '@/lib/offline-rules';
import { useSession } from '@/state/session';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { Banner } from '@/ui/layout';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';
import { WebFrame, type WebFrameHandle } from '@/ui/web-frame';

type ReaderMessage =
  | { type: 'ready' }
  | { type: 'loaded'; pageCount: number }
  | { type: 'page'; page: number; pageCount: number }
  | { type: 'error'; status: number; code: string };

type Saved = { readerHtml: string; base64: string };

/**
 * PDF lesson in the self-hosted reader page (T-038). The page receives the student's current access token over
 * postMessage, fetches the watermarked PDF itself and reports the page in view. Offline (D-067), the saved reader page
 * opens instead and the saved PDF is posted into it in pieces.
 */
export function PdfReader({
  itemId,
  startPage,
  onPage,
  offline = false,
  notice,
}: {
  itemId: string;
  startPage: number;
  onPage: (page: number, pageCount: number) => void;
  offline?: boolean;
  /** A PDF attached to a notice instead of a lesson (D-074): not watermarked, never saved offline. */
  notice?: { noticeId: string; mediaId: string };
}) {
  const { t } = useT();
  const frame = useRef<WebFrameHandle>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState<{ page: number; count: number } | null>(null);
  const [jumping, setJumping] = useState(false);
  const [target, setTarget] = useState('');
  const jump = () => {
    const n = Number.parseInt(target, 10);
    if (page && Number.isInteger(n))
      frame.current?.post({ type: 'goto', page: Math.min(Math.max(n, 1), page.count) });
    setJumping(false);
  };
  const [saved, setSaved] = useState<Saved | null>(null);

  useEffect(() => {
    if (!offline) return;
    let live = true;
    void savedPdf(itemId).then((copy) => {
      if (!live) return;
      if (copy) setSaved(copy);
      else setError(true);
    });
    return () => {
      live = false;
    };
  }, [offline, itemId]);

  const onMessage = useCallback(
    (raw: unknown) => {
      const message = raw as ReaderMessage;
      if (message?.type === 'ready' && offline) {
        if (!saved) return;
        frame.current?.post({ type: 'open', page: startPage });
        for (const data of base64Chunks(saved.base64)) frame.current?.post({ type: 'chunk', data });
        frame.current?.post({ type: 'end' });
      } else if (message?.type === 'ready') {
        frame.current?.post({
          type: 'open',
          token: useSession.getState().tokens?.accessToken ?? '',
          ...(notice ? notice : { itemId }),
          page: startPage,
        });
      } else if (message?.type === 'loaded') {
        // Opening the PDF counts as starting it (Home → Continue), even before any scrolling.
        const first = Math.min(startPage, message.pageCount);
        setPage({ page: first, count: message.pageCount });
        onPage(first, message.pageCount);
      } else if (message?.type === 'page') {
        setPage({ page: message.page, count: message.pageCount });
        onPage(message.page, message.pageCount);
      } else if (message?.type === 'error') {
        setError(true);
      }
    },
    [itemId, startPage, onPage, offline, saved, notice],
  );

  return (
    <View style={styles.fill}>
      {error ? <Banner message={t('learn.pdfError')} /> : null}
      {offline ? (
        saved ? (
          <WebFrame ref={frame} html={saved.readerHtml} title={t('item.pdf')} onMessage={onMessage} />
        ) : (
          <View style={styles.fill} />
        )
      ) : (
        <WebFrame
          ref={frame}
          uri={`${env.apiBaseUrl}/viewer/pdf`}
          title={t('item.pdf')}
          onMessage={onMessage}
        />
      )}
      <View style={styles.footer}>
        {page ? (
          <Pressable
            role="button"
            aria-label={t('item.goToPage')}
            onPress={() => {
              setTarget(String(page.page));
              setJumping(true);
            }}
            hitSlop={8}
          >
            <Text variant="caption" color="link" role="status">
              {t('item.pageOf', { page: page.page, total: page.count })} · {t('item.goToPage')}
            </Text>
          </Pressable>
        ) : null}
        {notice ? null : (
          <Text variant="caption" color="textMuted">
            {t('learn.watermark')}
          </Text>
        )}
      </View>
      <Dialog visible={jumping} title={t('item.goToPage')} onClose={() => setJumping(false)}>
        <TextField
          label={t('item.pageNumber', { total: page?.count ?? 1 })}
          value={target}
          onChangeText={setTarget}
          keyboardType="number-pad"
          autoFocus
          onSubmitEditing={jump}
        />
        <Button label={t('item.go')} onPress={jump} />
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  footer: { paddingHorizontal: 16, paddingVertical: 8, gap: 2 },
});
