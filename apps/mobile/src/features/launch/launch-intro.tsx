import { palette, radius } from '@tk/design-tokens';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n/use-t';
import { fontFamilies } from '@/theme/theme';
import { easeStandard, nativeDriver } from '@/ui/motion';

type Phase = 'playing' | 'waiting';

const spring = (value: Animated.Value, delay = 0) =>
  Animated.spring(value, { toValue: 1, delay, speed: 9, bounciness: 9, useNativeDriver: nativeDriver });
const timing = (value: Animated.Value, duration: number, delay = 0) =>
  Animated.timing(value, {
    toValue: 1,
    duration,
    delay,
    easing: easeStandard,
    useNativeDriver: nativeDriver,
  });

/**
 * The launch intro (phones only): on the brand navy, "T" and "K" fly in from either side and meet, the logo tile
 * springs up behind them, then the app's name rises in, then the slogan. The app loads underneath; the intro leaves
 * (fading and opening up) once both the animation and the app are ready. A tap skips it once the app is ready; with
 * reduced motion the finished picture shows briefly and fades.
 */
export function LaunchIntro({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const { t } = useT();
  const [values] = useState(() => ({
    glow: new Animated.Value(0),
    t: new Animated.Value(0),
    k: new Animated.Value(0),
    tile: new Animated.Value(0),
    name: new Animated.Value(0),
    tagline: new Animated.Value(0),
    line: new Animated.Value(0),
    exit: new Animated.Value(0),
  }));
  const [phase, setPhase] = useState<Phase>('playing');
  const sequence = useRef<Animated.CompositeAnimation | null>(null);
  const leaving = useRef(false);

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (!live) return;
        if (reduced) {
          Object.entries(values).forEach(([key, value]) => key !== 'exit' && value.setValue(1));
          setTimeout(() => live && setPhase('waiting'), 500);
          return;
        }
        // One timeline (ms): letters 100–700, tile from 520, name from 950, slogan from 1250 — about 1.8 s.
        sequence.current = Animated.parallel([
          timing(values.glow, 800),
          spring(values.t, 100),
          spring(values.k, 180),
          spring(values.tile, 520),
          timing(values.name, 400, 950),
          timing(values.tagline, 400, 1250),
          timing(values.line, 450, 1350),
        ]);
        sequence.current.start(({ finished }) => finished && live && setPhase('waiting'));
      });
    return () => {
      live = false;
      sequence.current?.stop();
    };
  }, [values]);

  // Leave once the animation has played and the app is ready underneath.
  useEffect(() => {
    if (phase !== 'waiting' || !ready || leaving.current) return;
    leaving.current = true;
    Animated.timing(values.exit, {
      toValue: 1,
      duration: 360,
      delay: 200,
      easing: Easing.in(Easing.quad),
      useNativeDriver: nativeDriver,
    }).start(() => onDone());
  }, [phase, ready, values, onDone]);

  const skip = () => {
    if (!ready || leaving.current) return;
    sequence.current?.stop();
    Object.entries(values).forEach(([key, value]) => key !== 'exit' && value.setValue(1));
    setPhase('waiting');
  };

  const fade = (v: Animated.Value, from: number) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }],
  });
  const letter = (v: Animated.Value, side: -1 | 1) => ({
    opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
    transform: [
      { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [side * 140, 0] }) },
      { rotate: v.interpolate({ inputRange: [0, 1], outputRange: [`${side * 25}deg`, '0deg'] }) },
    ],
  });

  return (
    <Animated.View
      aria-hidden
      style={[
        StyleSheet.absoluteFill,
        styles.root,
        {
          opacity: values.exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          transform: [{ scale: values.exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
        },
      ]}
    >
      <StatusBar style="light" />
      <Pressable style={styles.fill} onPress={skip}>
        <Animated.View
          style={[
            styles.glow,
            styles.glowTop,
            {
              opacity: values.glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] }),
              transform: [{ scale: values.glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.glow,
            styles.glowBottom,
            {
              opacity: values.glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.25] }),
              transform: [{ scale: values.glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
            },
          ]}
        />
        <View style={styles.center}>
          <View style={styles.mark}>
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                styles.tile,
                {
                  opacity: values.tile.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
                  transform: [
                    { scale: values.tile.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
                    {
                      rotate: values.tile.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['-18deg', '0deg'],
                      }),
                    },
                  ],
                },
              ]}
            />
            <View style={styles.letters}>
              <Animated.Text style={[styles.letter, letter(values.t, -1)]}>T</Animated.Text>
              <Animated.Text style={[styles.letter, letter(values.k, 1)]}>K</Animated.Text>
            </View>
          </View>
          <Animated.Text style={[styles.name, fade(values.name, 18)]}>{t('app.name')}</Animated.Text>
          <Animated.Text style={[styles.tagline, fade(values.tagline, 12)]}>{t('app.tagline')}</Animated.Text>
          <Animated.View
            style={[styles.line, { opacity: values.line, transform: [{ scaleX: values.line }] }]}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: palette.navy800, zIndex: 100, elevation: 100 },
  fill: { flex: 1, overflow: 'hidden' },
  glow: { position: 'absolute', borderRadius: radius.full, backgroundColor: palette.blue600 },
  glowTop: { width: 420, height: 420, top: -180, right: -160 },
  glowBottom: { width: 300, height: 300, bottom: -140, left: -120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  mark: { width: 116, height: 116, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  tile: {
    borderRadius: 34,
    backgroundColor: palette.blue600,
    boxShadow: '0 16px 40px rgba(37,99,214,0.45)',
  },
  letters: { flexDirection: 'row', alignItems: 'center' },
  letter: {
    color: palette.white,
    fontFamily: fontFamilies[700],
    fontSize: 50,
    lineHeight: 64,
    includeFontPadding: false,
  },
  // Mukta's Devanagari marks need generous line heights. Full-width lines: Android can measure Devanagari narrower
  // than it draws, which wrapped (and clipped) the slogan's last word.
  name: {
    alignSelf: 'stretch',
    color: palette.white,
    fontFamily: fontFamilies[700],
    fontSize: 32,
    lineHeight: 46,
    textAlign: 'center',
  },
  tagline: {
    alignSelf: 'stretch',
    color: palette.blue100,
    fontFamily: fontFamilies[500],
    fontSize: 19,
    lineHeight: 32,
    textAlign: 'center',
    marginTop: 2,
  },
  line: { width: 56, height: 4, borderRadius: 2, marginTop: 18, backgroundColor: palette.blue400 },
});
