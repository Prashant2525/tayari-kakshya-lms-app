import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useGoogleLogin } from '@/api/queries';
import { useT } from '@/i18n/use-t';
import { env } from '@/lib/env';
import { Button } from '@/ui/button';

WebBrowser.maybeCompleteAuthSession();

/** Google needs a client id for the current platform; without one the button is not shown (GOOGLE_OAUTH_*). */
export function googleConfigured(): boolean {
  const { androidClientId, iosClientId, webClientId } = env.google;
  return Boolean(Platform.select({ android: androidClientId, ios: iosClientId, default: webClientId }));
}

/** Gets a Google ID token and exchanges it at `POST /auth/google`; the API verifies it with Google. */
export function GoogleButton({ onError }: { onError: (error: unknown) => void }) {
  const { t, locale } = useT();
  const login = useGoogleLogin();
  const [request, response, prompt] = Google.useIdTokenAuthRequest({
    androidClientId: env.google.androidClientId,
    iosClientId: env.google.iosClientId,
    webClientId: env.google.webClientId,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params['id_token'];
      if (idToken) login.mutate({ idToken, locale }, { onError });
    } else if (response?.type === 'error') {
      onError(response.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per Google response
  }, [response]);

  return (
    <Button
      label={t('auth.google')}
      variant="secondary"
      disabled={!request}
      loading={login.isPending}
      onPress={() => void prompt()}
    />
  );
}
