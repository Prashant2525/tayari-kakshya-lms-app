import { Linking, Platform, StyleSheet, View } from 'react-native';
import { appVersion } from '@/api/client';
import { useAppConfig } from '@/api/queries';
import { localized } from '@/i18n/translate';
import { useT } from '@/i18n/use-t';
import { appGate } from '@/lib/app-gate';
import { LanguageToggle, LogoMark } from '@/ui/brand';
import { Button } from '@/ui/button';
import { Screen } from '@/ui/layout';
import { Text } from '@/ui/text';
import type { ReactNode } from 'react';

/**
 * Maintenance and force-update screens (S24), driven by `/app/config` from the CMS.
 * If the config cannot be loaded (offline), the app opens normally rather than locking students out.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const config = useAppConfig();
  const { t, locale } = useT();
  if (!config.data) return <>{children}</>;
  const gate = appGate(config.data, Platform.OS, appVersion);
  if (gate.kind === 'open') return <>{children}</>;

  const maintenance = gate.kind === 'maintenance';
  const message = maintenance ? localized(gate.message, locale) : '';
  return (
    <Screen background="surface">
      <View style={styles.top}>
        <LanguageToggle />
      </View>
      <View style={styles.center}>
        <LogoMark size={64} />
        <Text variant="h2" align="center" role="heading">
          {maintenance ? t('state.maintenanceTitle') : t('state.updateTitle')}
        </Text>
        <Text variant="body" color="textSecondary" align="center">
          {maintenance ? message || t('state.maintenanceBody') : t('state.updateBody')}
        </Text>
        {maintenance ? (
          <Button
            label={t('common.retry')}
            variant="secondary"
            loading={config.isFetching}
            onPress={() => void config.refetch()}
            style={styles.action}
          />
        ) : gate.storeUrl ? (
          <Button
            label={t('state.updateNow')}
            onPress={() => void Linking.openURL(gate.storeUrl as string)}
            style={styles.action}
          />
        ) : (
          <Text variant="bodySm" color="textMuted" align="center">
            {t('state.updateNoLink')}
          </Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'flex-end', paddingTop: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 48 },
  action: { alignSelf: 'stretch', marginTop: 12 },
});
