import type { ExpoConfig } from 'expo/config';

/**
 * Store identifiers (Android package / iOS bundle id) are the owner's choice and are not set yet
 * (OPEN_QUESTIONS L5). They are read from the environment so EAS builds can supply them.
 */
const androidPackage = process.env.APP_ANDROID_PACKAGE || undefined;
const iosBundleId = process.env.APP_IOS_BUNDLE_ID || undefined;

const config: ExpoConfig = {
  name: 'Tayari Kakshya',
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
  plugins: ['expo-router', 'expo-secure-store', 'expo-font', 'expo-localization', 'expo-web-browser'],
  experiments: { typedRoutes: true },
};

export default config;
