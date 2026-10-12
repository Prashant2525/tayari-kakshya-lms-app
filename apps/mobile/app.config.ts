import type { ExpoConfig } from 'expo/config';

/**
 * Store identifiers (Android package / iOS bundle id), chosen by the owner (D-065). To change them, edit APP_ID or
 * set APP_ANDROID_PACKAGE / APP_IOS_BUNDLE_ID (locally or as EAS environment variables). Once the app is published
 * the stores tie the listing to the identifier for good: a new identifier is a new app.
 */
const APP_ID = 'com.tayarikakshya.app';
const androidPackage = process.env.APP_ANDROID_PACKAGE || APP_ID;
const iosBundleId = process.env.APP_IOS_BUNDLE_ID || APP_ID;
/**
 * The owner's EAS project (expo.dev: prashantdhimals-team / tayari-kakshya). Its id is public (it is in every build)
 * and push tokens need it (D-033); EAS_PROJECT_ID can point a build at another project.
 */
const EAS_OWNER = 'prashantdhimals-team';
const easProjectId = process.env.EAS_PROJECT_ID || 'ba6edf8d-8869-4213-97c9-99e9ddf12cdd';

/**
 * A store build without the API's public address would install fine and then fail to reach anything (the address is
 * built into the app). EAS sets EAS_BUILD_PROFILE while building; the production profile must have an https API
 * (EAS environment "production", see the deployment guide).
 */
if (
  process.env.EAS_BUILD_PROFILE === 'production' &&
  !/^https:\/\/[^/]+/.test(process.env.EXPO_PUBLIC_API_URL ?? '')
) {
  throw new Error(
    'EXPO_PUBLIC_API_URL must be the https address of the production API for a production build ' +
      '(eas env:set --environment production --name EXPO_PUBLIC_API_URL ...).',
  );
}

const config: ExpoConfig = {
  name: 'Tayari Kakshya',
  owner: EAS_OWNER,
  slug: 'tayari-kakshya',
  scheme: 'tayarikakshya',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#F6F8FC',
  ios: { supportsTablet: true, bundleIdentifier: iosBundleId },
  android: {
    package: androidPackage,
    // Tokens and the device id live in the Keystore-backed secure store; never in auto backups.
    allowBackup: false,
    // Firebase's google-services.json registers the Android app with FCM for push notifications. Its path comes from
    // GOOGLE_SERVICES_JSON (an EAS "file" environment variable for store builds); without it, Android push is off.
    ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
  },
  web: { output: 'single', bundler: 'metro' },
  plugins: [
    'expo-router',
    // The native splash shows the brand navy, so the animated launch intro takes over without a flash.
    ['expo-splash-screen', { backgroundColor: '#15234D' }],
    'expo-secure-store',
    'expo-font',
    'expo-localization',
    'expo-web-browser',
    'expo-notifications',
    // Native crash reporting in development / store builds (T-042). Source maps are uploaded by release builds
    // with SENTRY_AUTH_TOKEN (+ SENTRY_ORG / SENTRY_PROJECT) set as EAS secrets.
    '@sentry/react-native/expo',
  ],
  experiments: { typedRoutes: true },
  extra: { eas: { projectId: easProjectId } },
};

export default config;
