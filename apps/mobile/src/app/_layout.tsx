import {
  Mukta_400Regular,
  Mukta_500Medium,
  Mukta_600SemiBold,
  Mukta_700Bold,
  useFonts,
} from '@expo-google-fonts/mukta';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { api, queryClient } from '@/api/client';
import { AppGate } from '@/features/app-gate';
import { useGuards } from '@/features/guards';
import { usePrefs } from '@/state/prefs';
import { useSession } from '@/state/session';
import { ThemeProvider, useTheme } from '@/theme/theme';
import { ErrorState, LoadingState } from '@/ui/states';

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

  // Keep the account's language (used for emails and notifications) in step with the app.
  useEffect(() => {
    if (signedIn && me.data && me.data.locale !== locale) {
      void api.patch('/me', { locale }).catch(() => undefined);
    }
  }, [signedIn, locale, me.data]);

  // The navigator stays mounted (navigation state survives); account data loads under an overlay.
  const blocking = signedIn && (me.isPending || targets.isPending || me.isError || targets.isError);
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !mustVerify && !needsOnboarding}>
          <Stack.Screen name="(tabs)" />
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
