import {
  Mukta_400Regular,
  Mukta_500Medium,
  Mukta_600SemiBold,
  Mukta_700Bold,
  useFonts,
} from '@expo-google-fonts/mukta';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router, Stack, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { api, queryClient } from '@/api/client';
import { AppGate } from '@/features/app-gate';
import { useGuards } from '@/features/guards';
import { useAnalyticsIdentity, useScreenTracking } from '@/lib/analytics';
import { initMonitoring } from '@/lib/monitoring';
import { checkoutHref, usePendingLink } from '@/lib/pending-link';
import { listenForTaps, registerForPush } from '@/lib/push';
import { startStudyClock, studySignal } from '@/lib/study-time';
import { usePrefs } from '@/state/prefs';
import { useSession } from '@/state/session';
import { ThemeProvider, useTheme } from '@/theme/theme';
import { ErrorState, LoadingState } from '@/ui/states';

initMonitoring();
startStudyClock();
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

// React Query pauses requests while offline and resumes when the connection returns.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Mukta_400Regular,
    Mukta_500Medium,
    Mukta_600SemiBold,
    Mukta_700Bold,
  });
  const prefsLoaded = usePrefs((s) => s.loaded);
  const sessionStatus = useSession((s) => s.status);

  useEffect(() => {
    void usePrefs.getState().load();
    void useSession.getState().load();
  }, []);

  // A font that fails to load falls back to the system font rather than blocking the app.
  const ready = (fontsLoaded || Boolean(fontError)) && prefsLoaded && sessionStatus !== 'loading';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SafeAreaProvider>
          <ThemedStatusBar />
          <AppGate>
            <RootNavigator />
          </AppGate>
        </SafeAreaProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

/** Screens are grouped behind the guards from `useGuards` (features/guards.ts). */
function RootNavigator() {
  const locale = usePrefs((s) => s.locale);
  const { signedIn, mustVerify, needsOnboarding, me, targets } = useGuards();
  const { colors } = useTheme();
  useScreenTracking();
  useAnalyticsIdentity(me.data?.analyticsId, signedIn);

  // Keep the account's language (used for emails and notifications) in step with the app.
  useEffect(() => {
    if (signedIn && me.data && me.data.locale !== locale) {
      void api.patch('/me', { locale }).catch(() => undefined);
    }
  }, [signedIn, locale, me.data]);

  // The navigator stays mounted (navigation state survives); account data loads under an overlay.
  const blocking = signedIn && (me.isPending || targets.isPending || me.isError || targets.isError);

  // A checkout share link opened while signed out is opened once the student is in (D-056).
  const url = Linking.useURL();
  const pending = usePendingLink((s) => s.href);
  useEffect(() => {
    const href = checkoutHref(url);
    if (href && !signedIn) usePendingLink.getState().set(href);
  }, [url, signedIn]);
  const inside = signedIn && !mustVerify && !needsOnboarding && !blocking;
  // Push (D-033): asked for once the student is in; tapped notifications open their screen.
  useEffect(() => {
    if (inside) void registerForPush();
  }, [inside]);
  useEffect(() => {
    const subscription = listenForTaps();
    return () => subscription?.remove();
  }, []);
  useEffect(() => {
    if (!inside || !pending) return;
    usePendingLink.getState().set(null);
    router.push(pending as Href);
  }, [inside, pending]);
  return (
    <View style={{ flex: 1 }} onTouchStart={() => studySignal('touch')}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !mustVerify && !needsOnboarding}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(learn)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !mustVerify}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="verify" />
        </Stack.Protected>
      </Stack>
      {blocking ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
          {me.isError || targets.isError ? (
            <ErrorState
              error={me.error ?? targets.error}
              onRetry={() => {
                void me.refetch();
                void targets.refetch();
              }}
            />
          ) : (
            <LoadingState />
          )}
        </View>
      ) : null}
    </View>
  );
}
