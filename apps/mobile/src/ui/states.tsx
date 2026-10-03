import { useNetInfo } from '@react-native-community/netinfo';
import { radius } from '@tk/design-tokens';
import { AlertCircle, WifiOff, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n/use-t';
import { errorMessageKey } from '@/lib/error-message';
import { useTheme } from '@/theme/theme';
import { Button } from './button';
import { Text } from './text';

/** Friendly empty list: icon, title, one line and an optional action (DESIGN_SYSTEM §7). */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <View style={[styles.iconTile, { backgroundColor: colors.primarySoft }]}>
        <Icon size={32} color={colors.onPrimarySoft} strokeWidth={1.75} />
      </View>
      <Text variant="h4" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="body" color="textSecondary" align="center">
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

/** Load failure with a retry button. Shows the translated reason (network, server…). */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <View role="alert" style={styles.center}>
      <View style={[styles.iconTile, { backgroundColor: colors.dangerSoft }]}>
        <AlertCircle size={32} color={colors.danger} strokeWidth={1.75} />
      </View>
      <Text variant="h4" align="center">
        {t('state.errorTitle')}
      </Text>
      <Text variant="body" color="textSecondary" align="center">
        {t(errorMessageKey(error))}
      </Text>
      <Button label={t('common.retry')} variant="secondary" size="md" onPress={onRetry} />
    </View>
  );
}

export function LoadingState() {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <View style={styles.center} aria-busy>
      <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
    </View>
  );
}

/** Thin banner while the phone has no connection. */
export function OfflineBanner() {
  const { colors } = useTheme();
  const { t } = useT();
  const net = useNetInfo();
  if (net.isConnected !== false) return null;
  return (
    <View role="status" style={[styles.offline, { backgroundColor: colors.text }]}>
      <WifiOff size={16} color={colors.bg} strokeWidth={1.75} />
      <Text variant="bodySm" style={{ color: colors.bg, flex: 1 }}>
        {t('state.offline')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  iconTile: {
    width: 72,
    height: 72,
    borderRadius: radius.xl - 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
});
