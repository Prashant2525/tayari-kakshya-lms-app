/**
 * Build-time public configuration. EXPO_PUBLIC_* values are embedded in the app binary: never put secrets here.
 * Each variable must be read as `process.env.EXPO_PUBLIC_X` (literally) so Expo can inline it.
 *
 * EXPO_PUBLIC_API_URL: API origin, e.g. https://api.example.com. Empty = same origin (web builds behind a proxy).
 * On an Android emulator use http://10.0.2.2:4000; on a phone use your computer's LAN address.
 */
const apiOrigin = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export const env = {
  apiBaseUrl: `${apiOrigin}/api/v1`,
  google: {
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
  },
};
