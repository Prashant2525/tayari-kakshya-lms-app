import { CloudCheck, CloudDownload } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import type { ItemContent } from '@/api/learning';
import { useAppConfig } from '@/api/queries';
import { useT } from '@/i18n/use-t';
import { offlineSupported, useOffline } from '@/lib/offline';
import { useTheme } from '@/theme/theme';

/** Saves a note or PDF for offline reading, or removes the saved copy (D-067). Hidden where offline is not available. */
export function DownloadButton({
  item,
  where,
}: {
  item: ItemContent;
  where: { courseId?: string; subjectId?: string; slug?: string };
}) {
  const { t } = useT();
  const { colors } = useTheme();
  const config = useAppConfig();
  const saved = useOffline((s) => Boolean(s.items[item.id]));
  const busy = useOffline((s) => Boolean(s.busy[item.id]));
  if (!offlineSupported || item.type === 'video' || config.data?.offline?.enabled === false) return null;
  const label = saved ? t('offline.remove') : t('offline.download');
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-busy={busy}
      disabled={busy}
      onPress={() =>
        saved
          ? useOffline.getState().remove(item.id)
          : void useOffline
              .getState()
              .download(item, where)
              .catch(() => undefined)
      }
      hitSlop={4}
      style={styles.button}
    >
      {busy ? (
        <ActivityIndicator color={colors.textSecondary} />
      ) : saved ? (
        <CloudCheck size={22} color={colors.success} strokeWidth={1.75} />
      ) : (
        <CloudDownload size={22} color={colors.text} strokeWidth={1.75} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
