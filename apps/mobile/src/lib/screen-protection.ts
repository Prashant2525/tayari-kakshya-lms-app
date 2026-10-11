import { enableAppSwitcherProtectionAsync, preventScreenCaptureAsync } from 'expo-screen-capture';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * D-068: screenshots and screen recording are blocked on every screen of the app, free and premium alike (Android
 * blocks them and blanks the app in the recent-apps view; iOS hides the content in screenshots and recordings and
 * blurs the app in the app switcher). Turned on once, for as long as the app runs. Nothing to do on the web.
 */
export function useScreenProtection(): void {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void preventScreenCaptureAsync('app').catch(() => undefined);
    if (Platform.OS === 'ios') void enableAppSwitcherProtectionAsync().catch(() => undefined);
  }, []);
}
