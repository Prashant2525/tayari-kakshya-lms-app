import { palette } from '@tk/design-tokens';
import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { nativeDriver } from './motion';
import { Text } from './text';

/**
 * Scroll-linked motion (DESIGN_SYSTEM §6, T-071): one Animated value follows the scroll position (on the UI thread on
 * phones) and drives the headers below — a large title that gives way to a compact bar, and parallax heroes.
 */
export function useScrollMotion() {
  const [scrollY] = useState(() => new Animated.Value(0));
  const [onScroll] = useState(() =>
    Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: nativeDriver }),
  );
  return { scrollY, onScroll, scrollEventThrottle: 16 } as const;
}

/**
 * The status bar icons for a screen while it is in view: `light` over the navy heroes (clock, Wi-Fi and battery
 * stay readable in the light theme), the theme's own when the screen is left.
 */
export function useStatusBarStyle(style: 'light' | 'dark') {
  const { scheme } = useTheme();
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(style, true);
      return () => setStatusBarStyle(scheme === 'dark' ? 'light' : 'dark', true);
    }, [style, scheme]),
  );
}

/** The screen's title, large; it fades as the page scrolls and stretches a little when pulled down. */
export function LargeTitle({ title, scrollY }: { title: string; scrollY: Animated.Value }) {
  return (
    <Animated.View
      style={{
        transformOrigin: 'left center',
        opacity: scrollY.interpolate({ inputRange: [0, 44], outputRange: [1, 0], extrapolate: 'clamp' }),
        transform: [
          {
            scale: scrollY.interpolate({
              inputRange: [-120, 0],
              outputRange: [1.12, 1],
              extrapolate: 'clamp',
            }),
          },
        ],
      }}
    >
      <Text variant="h1" role="heading">
        {title}
      </Text>
    </Animated.View>
  );
}

/**
 * The compact bar that takes over from the large title once the page has scrolled: its surface, hairline and soft
 * shadow fade in and the small title rises into place. Decorative (the large title is the heading); `brand` is the
 * navy version for screens with a navy hero.
 */
export function CompactBar({
  title,
  scrollY,
  start = 36,
  tone = 'surface',
  leading,
}: {
  title: string;
  scrollY: Animated.Value;
  /** Scroll distance (px) where the bar starts to appear. */
  start?: number;
  tone?: 'surface' | 'brand';
  leading?: ReactNode;
}) {
  const { colors, scheme } = useTheme();
  const shown = scrollY.interpolate({
    inputRange: [start, start + 28],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const brand = tone === 'brand';
  return (
    <View pointerEvents="none" aria-hidden style={styles.bar}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: shown,
            backgroundColor: brand ? palette.navy800 : colors.surface,
            borderBottomColor: brand ? 'transparent' : colors.border,
          },
          styles.barSurface,
          !brand && scheme === 'light' && styles.barShadow,
        ]}
      />
      <Animated.View
        style={[
          styles.barContent,
          {
            opacity: shown,
            transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
          },
        ]}
      >
        {leading}
        <Text
          variant="h4"
          weight={700}
          numberOfLines={1}
          style={brand ? { color: palette.white } : undefined}
        >
          {title}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, height: 52, zIndex: 10 },
  barSurface: { borderBottomWidth: StyleSheet.hairlineWidth },
  barShadow: { boxShadow: '0 4px 14px rgba(15,27,61,0.06)' },
  barContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 56,
  },
});
