import { Tabs } from 'expo-router';
import type { BottomTabNavigationOptions } from 'expo-router/js-tabs';
import { BookOpen, House, Megaphone, User, type LucideIcon } from 'lucide-react-native';
import type { ColorValue } from 'react-native';
import { useUnseenNotices } from '@/api/notices';
import { useT } from '@/i18n/use-t';
import { durations, easeStandard, useReducedMotion } from '@/ui/motion';
import { TabBar } from '@/ui/tab-bar';

/** Switching tabs: the new screen fades in while sliding a short way from the side of the tab it comes from. */
const shiftAndFade: NonNullable<BottomTabNavigationOptions['sceneStyleInterpolator']> = ({ current }) => ({
  sceneStyle: {
    opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
    transform: [
      { translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-36, 0, 36] }) },
    ],
  },
});

const icon =
  (Icon: LucideIcon) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Icon size={24} color={color as string} strokeWidth={focused ? 2.25 : 1.75} />
  );

export default function TabsLayout() {
  const { t } = useT();
  const reduced = useReducedMotion();
  const unseen = useUnseenNotices(true).data?.count ?? 0;
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        ...(reduced
          ? { animation: 'none' as const }
          : {
              sceneStyleInterpolator: shiftAndFade,
              transitionSpec: {
                animation: 'timing' as const,
                config: { duration: durations.slow - 40, easing: easeStandard },
              },
            }),
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: icon(House) }} />
      <Tabs.Screen name="courses" options={{ title: t('tabs.courses'), tabBarIcon: icon(BookOpen) }} />
      <Tabs.Screen
        name="notices"
        options={{
          title: t('tabs.notices'),
          tabBarBadge: unseen > 0 ? (unseen > 9 ? '9+' : unseen) : undefined,
          tabBarAccessibilityLabel: unseen > 0 ? t('notices.tabNew', { count: unseen }) : t('tabs.notices'),
          tabBarIcon: icon(Megaphone),
        }}
      />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: icon(User) }} />
    </Tabs>
  );
}
