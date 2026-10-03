import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n/use-t';
import { env } from '@/lib/env';
import { useSession } from '@/state/session';
import { Banner } from '@/ui/layout';
import { Text } from '@/ui/text';
import { WebFrame, type WebFrameHandle } from '@/ui/web-frame';

type ReaderMessage =
  | { type: 'ready' }
  | { type: 'loaded'; pageCount: number }
  | { type: 'page'; page: number; pageCount: number }
  | { type: 'error'; status: number; code: string };

/**
 * PDF lesson in the self-hosted reader page (T-038). The page receives the student's current access token over
 * postMessage, fetches the watermarked PDF itself and reports the page in view.
 */
export function PdfReader({
  itemId,
  startPage,
  onPage,
}: {
  itemId: string;
  startPage: number;
  onPage: (page: number, pageCount: number) => void;
}) {
  const { t } = useT();
  const frame = useRef<WebFrameHandle>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState<{ page: number; count: number } | null>(null);

  const onMessage = useCallback(
    (raw: unknown) => {
      const message = raw as ReaderMessage;
      if (message?.type === 'ready') {
        frame.current?.post({
          type: 'open',
          token: useSession.getState().tokens?.accessToken ?? '',
          itemId,
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
    [itemId, startPage, onPage],
  );

  return (
    <View style={styles.fill}>
      {error ? <Banner message={t('learn.pdfError')} /> : null}
      <WebFrame
        ref={frame}
        uri={`${env.apiBaseUrl}/viewer/pdf`}
        title={t('item.pdf')}
        onMessage={onMessage}
      />
      <View style={styles.footer}>
        {page ? (
          <Text variant="caption" color="textSecondary" role="status">
            {t('item.pageOf', { page: page.page, total: page.count })}
          </Text>
        ) : null}
        <Text variant="caption" color="textMuted">
          {t('learn.watermark')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  footer: { paddingHorizontal: 16, paddingVertical: 8, gap: 2 },
});
