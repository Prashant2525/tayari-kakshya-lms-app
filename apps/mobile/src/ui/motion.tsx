import { motion } from '@tk/design-tokens';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/**
 * Motion (DESIGN_SYSTEM §6): opacity and transform only, the standard easing, and no motion when the student asks
 * the phone for less (reduced motion). React Native's Animated with the native driver: runs on the UI thread on
 * phones; the web build (development and browser tests) runs it in JavaScript.
 */
export const easeStandard = Easing.bezier(0.2, 0, 0, 1);
export const durations = { fast: motion.fast, base: motion.base, slow: motion.slow } as const;
export const nativeDriver = Platform.OS !== 'web';

/**
 * Screens pushed on a stack slide in from the right with the previous one easing back, as on iOS, on Android too
 * (where the platform default is a fade from below). iOS keeps its native push; the phone's reduced-motion setting is
 * honoured by the platform transitions.
 */
export const stackMotion = { animation: 'ios_from_right' } as const;

/** Whether the phone asks for reduced motion (kept up to date). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => live && setReduced(value))
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** How far it shrinks while pressed (1 = not at all). */
  pressedScale?: number;
  children?: ReactNode;
};

/** A pressable that shrinks slightly under the finger and springs back — the app's press feedback. */
export function PressableScale({
  pressedScale = 0.97,
  style,
  onPressIn,
  onPressOut,
  children,
  ...props
}: PressableScaleProps) {
  const [scale] = useState(() => new Animated.Value(1));
  const reduced = useReducedMotion();
  const to = (value: number) =>
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: nativeDriver,
      speed: 40,
      bounciness: value === 1 ? 6 : 0,
    }).start();
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(e) => {
        if (!reduced) to(pressedScale);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        onPressOut?.(e);
      }}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * Fades and rises into place when it first appears; `index` staggers the first few of a list (rows that mount later,
 * as the list scrolls, rise in at once).
 */
export function FadeInUp({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: durations.slow,
      delay: index < 6 ? index * 55 : 0,
      easing: easeStandard,
      useNativeDriver: nativeDriver,
    }).start();
  }, [progress, index]);
  if (reduced) return <Animated.View style={style}>{children}</Animated.View>;
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
