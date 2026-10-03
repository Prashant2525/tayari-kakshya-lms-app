import { Tabs } from 'expo-router';
import { BookOpen, House, Megaphone, User } from 'lucide-react-native';
import { useT } from '@/i18n/use-t';
import { fontFamilies, useTheme } from '@/theme/theme';

export default function TabsLayout() {
  const { t } = useT();
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.link,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 70 },
        tabBarItemStyle: { paddingVertical: 6 },
        // Mukta's Devanagari marks need an explicit line height or labels are clipped.
        tabBarLabelStyle: { fontFamily: fontFamilies[600], fontSize: 12, lineHeight: 22, paddingBottom: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color }) => <House size={24} color={color} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          title: t('tabs.courses'),
          tabBarIcon: ({ color }) => <BookOpen size={24} color={color} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="notices"
        options={{
          title: t('tabs.notices'),
          tabBarIcon: ({ color }) => <Megaphone size={24} color={color} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color }) => <User size={24} color={color} strokeWidth={1.75} />,
        }}
      />
    </Tabs>
  );
}
