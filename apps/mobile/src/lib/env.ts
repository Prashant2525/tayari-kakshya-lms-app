import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { devApiOrigin } from './dev-api';

/**
 * Build-time public configuration. EXPO_PUBLIC_* values are embedded in the app binary: never put secrets here.
 * Each variable must be read as `process.env.EXPO_PUBLIC_X` (literally) so Expo can inline it.
 *
 * EXPO_PUBLIC_API_URL: API origin for builds, e.g. https://api.example.com. Empty in a release web build = same
 * origin (served behind a proxy). In development it can be left unset: see `devApiOrigin`.
 */
const configured = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

const apiOrigin =
  configured ||
  (__DEV__ ? devApiOrigin(Platform.OS, globalThis.location?.hostname, Constants.expoConfig?.hostUri) : '');

export const env = {
  apiBaseUrl: `${apiOrigin}/api/v1`,
  google: {
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
  },
};
