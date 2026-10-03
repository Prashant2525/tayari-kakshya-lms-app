import { Bookmark } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';
import { useBookmarks, useToggleBookmark, type BookmarkTarget } from '@/api/learning';
import { useT } from '@/i18n/use-t';
import { useTheme } from '@/theme/theme';

/** Save / unsave a lesson or question (bookmarks are listed in Profile → Saved). */
export function BookmarkButton({ type, id }: { type: BookmarkTarget; id: string }) {
  const { colors } = useTheme();
  const { t } = useT();
  const bookmarks = useBookmarks();
  const toggle = useToggleBookmark();
  const saved = Boolean(bookmarks.data?.some((b) => b.targetType === type && b.id === id));
  const on = toggle.isPending ? toggle.variables.on : saved;
  return (
    <Pressable
      role="button"
      aria-label={on ? t('bookmark.remove') : t('bookmark.add')}
      aria-pressed={on}
      disabled={toggle.isPending || bookmarks.isPending}
      onPress={() => toggle.mutate({ type, id, on: !saved })}
      style={styles.button}
      hitSlop={4}
    >
      <Bookmark
        size={22}
        color={on ? colors.primary : colors.textSecondary}
        fill={on ? colors.primary : 'transparent'}
        strokeWidth={1.75}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
