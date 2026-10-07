import type { ExpoConfig } from 'expo/config';

/**
 * Store identifiers (Android package / iOS bundle id) are the owner's choice and are not set yet
 * (OPEN_QUESTIONS L5). They are read from the environment so EAS builds can supply them.
 */
const androidPackage = process.env.APP_ANDROID_PACKAGE || undefined;
const iosBundleId = process.env.APP_IOS_BUNDLE_ID || undefined;
/**
 * The owner's EAS project (expo.dev: prashantdhimals-team / tayari-kakshya). Its id is public (it is in every build)
 * and push tokens need it (D-033); EAS_PROJECT_ID can point a build at another project.
 */
const EAS_OWNER = 'prashantdhimals-team';
const easProjectId = process.env.EAS_PROJECT_ID || 'ba6edf8d-8869-4213-97c9-99e9ddf12cdd';

const config: ExpoConfig = {
  name: 'Tayari Kakshya',
  owner: EAS_OWNER,
  slug: 'tayari-kakshya',
  scheme: 'tayarikakshya',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#F6F8FC',
  ios: { supportsTablet: true, ...(iosBundleId ? { bundleIdentifier: iosBundleId } : {}) },
  android: {
    ...(androidPackage ? { package: androidPackage } : {}),
    // Tokens and the device id live in the Keystore-backed secure store; never in auto backups.
    allowBackup: false,
  },
  web: { output: 'single', bundler: 'metro' },
  plugins: [
    'expo-router',
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
