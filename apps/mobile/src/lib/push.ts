import Constants from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';
import { api } from '@/api/client';
import type { NotificationLink } from '@/api/notices';

/**
 * Push notifications (D-033, T-011). Needs an EAS project (its id in app config `extra.eas.projectId`, set from
 * EAS_PROJECT_ID) and a development or store build; Expo Go on Android cannot receive push since SDK 53. Until then
 * this does nothing, and notices and notifications still appear in the app and by email.
 */
const projectId: string | undefined =
  (Constants.expoConfig?.extra?.['eas'] as { projectId?: string } | undefined)?.projectId ??
  Constants.easConfig?.projectId;

/** Expo Go on Android cannot receive push (SDK 53+): only development and store builds can. */
const expoGoAndroid = Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient';

export const pushAvailable = Platform.OS !== 'web' && !expoGoAndroid && Boolean(projectId);

/**
 * Loaded only where push works: in Expo Go on Android merely importing expo-notifications throws (SDK 53+), which
 * broke every screen that imports this file.
 */
const Notifications: typeof NotificationsModule | null = pushAvailable
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-notifications') as typeof NotificationsModule)
  : null;

let registered: string | null = null;

if (Notifications) {
  // Shown while the app is open, too.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Where a notification leads in the app. */
export function hrefFor(link: NotificationLink | null | undefined): Href | null {
  if (!link) return null;
  switch (link.type) {
    case 'notice':
      return { pathname: '/notice/[id]', params: { id: link.id } };
    case 'course':
      return { pathname: '/course/[slug]', params: { slug: link.slug } };
    case 'plan':
      return '/plans';
    case 'order':
      return '/purchases';
    case 'assessment':
      return { pathname: '/test/[id]', params: { id: link.id } };
    case 'attempt':
      return { pathname: '/result/[attemptId]', params: { attemptId: link.id } };
    case 'article':
      return { pathname: '/article/[slug]', params: { slug: link.slug } };
  }
}

/** Asks for permission (once the student is signed in) and registers this device with the API. */
export async function registerForPush(): Promise<void> {
  if (!Notifications || registered) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Tayari Kakshya',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.post('/me/push-tokens', { token, platform: Platform.OS });
    registered = token;
  } catch {
    // Push is an extra: the app works without it (and tries again on the next start).
  }
}

/** Before signing out: this device stops receiving the account's notifications. */
export async function unregisterPush(): Promise<void> {
  if (!registered) return;
  const token = registered;
  registered = null;
  await api.post('/me/push-tokens/remove', { token }).catch(() => undefined);
}

/** Opens the screen of a tapped notification. Returns the subscription to remove. */
export function listenForTaps(): { remove(): void } | null {
  if (!Notifications) return null;
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { link?: NotificationLink } | undefined;
    const href = hrefFor(data?.link);
    if (href) router.push(href);
  });
}
