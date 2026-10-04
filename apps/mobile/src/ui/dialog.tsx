import { radius } from '@tk/design-tokens';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n/use-t';
import { useTheme } from '@/theme/theme';
import { Text } from './text';

/** Centred confirmation dialog (DESIGN_SYSTEM §7): title, body and up to two actions stacked full width. */
export function Dialog({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.center}>
        <Pressable style={styles.scrim} onPress={onClose} aria-label={t('common.close')} />
        <View
          role="dialog"
          aria-label={title}
          style={[styles.card, { backgroundColor: colors.surfaceRaised }]}
        >
          <Text variant="h3" role="heading">
            {title}
          </Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,27,61,0.45)',
  },
  card: { width: '100%', maxWidth: 420, borderRadius: radius.lg, padding: 20, gap: 12 },
});
