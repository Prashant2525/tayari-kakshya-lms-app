import { palette, radius } from '@tk/design-tokens';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { easeStandard, durations, nativeDriver, useReducedMotion } from './motion';
import { Text } from './text';

const PILL_WIDTH = 60;

/**
 * The bottom tab bar: a soft pill slides behind the chosen tab's icon, which lifts a little when chosen. Tabs keep
 * the navigator's behaviour (press / long-press events, badges, accessibility labels such as "Notices, 2 new").
 */
export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { colors, scheme } = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const slot = width / state.routes.length;
  const [position] = useState(() => new Animated.Value(state.index));

  useEffect(() => {
    if (reduced) {
      position.setValue(state.index);
      return;
    }
    Animated.spring(position, {
      toValue: state.index,
      useNativeDriver: nativeDriver,
      speed: 18,
      bounciness: 7,
    }).start();
  }, [state.index, position, reduced]);

  return (
    <View
      role="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        scheme === 'light' && styles.shadow,
      ]}
    >
      {width > 0 ? (
        <Animated.View
          aria-hidden
          pointerEvents="none"
          style={[
            styles.pill,
            {
              backgroundColor: colors.primarySoft,
              left: (slot - PILL_WIDTH) / 2,
              transform: [
                {
                  translateX: position.interpolate({
                    inputRange: [0, Math.max(1, state.routes.length - 1)],
                    outputRange: [0, slot * Math.max(1, state.routes.length - 1)],
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key]!;
        const focused = state.index === index;
        const label = typeof options.title === 'string' ? options.title : route.name;
        const color = focused ? colors.link : colors.textMuted;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable
            key={route.key}
            role="tab"
            aria-selected={focused}
            accessibilityState={{ selected: focused }}
            aria-label={options.tabBarAccessibilityLabel ?? label}
            testID={options.tabBarButtonTestID}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            style={styles.tab}
          >
            <TabIcon focused={focused} reduced={reduced}>
              {options.tabBarIcon?.({ focused, color, size: 24 })}
              {options.tabBarBadge !== undefined ? (
                <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.surface }]}>
                  <Text variant="caption" weight={700} style={styles.badgeText}>
                    {String(options.tabBarBadge)}
                  </Text>
                </View>
              ) : null}
            </TabIcon>
            <Text
              variant="caption"
              weight={focused ? 700 : 500}
              numberOfLines={1}
              style={[styles.label, { color }]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The icon lifts and grows a touch when its tab is chosen. */
function TabIcon({
  focused,
  reduced,
  children,
}: {
  focused: boolean;
  reduced: boolean;
  children: React.ReactNode;
}) {
  const [lift] = useState(() => new Animated.Value(focused ? 1 : 0));
  useEffect(() => {
    Animated.timing(lift, {
      toValue: focused ? 1 : 0,
      duration: reduced ? 0 : durations.slow,
      easing: easeStandard,
      useNativeDriver: nativeDriver,
    }).start();
  }, [focused, lift, reduced]);
  return (
    <Animated.View
      style={[
        styles.icon,
        {
          transform: [
            { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }) },
            { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  shadow: { boxShadow: '0 -6px 20px rgba(15,27,61,0.06)' },
  pill: { position: 'absolute', top: 8, width: PILL_WIDTH, height: 34, borderRadius: radius.full },
  tab: { flex: 1, alignItems: 'center', gap: 2, minHeight: 52 },
  icon: { height: 34, alignItems: 'center', justifyContent: 'center' },
  // Mukta's Devanagari marks need an explicit line height or labels are clipped.
  label: { fontSize: 12, lineHeight: 18 },
  badge: {
    position: 'absolute',
    top: 1,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: palette.white, fontSize: 10, lineHeight: 12 },
});
