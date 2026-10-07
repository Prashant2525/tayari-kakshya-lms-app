import { QueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { createApiClient, ApiError } from '@/lib/api-client';
import { platform } from '@/lib/device';
import { env } from '@/lib/env';
import { usePrefs } from '@/state/prefs';
import { useSession } from '@/state/session';

export const appVersion = Constants.expoConfig?.version ?? '0.0.0';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // Never retry client errors (403/404/validation); retry network and server errors twice.
      retry: (count, error) =>
        count < 2 && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500),
    },
  },
});

export const api = createApiClient({
  baseUrl: env.apiBaseUrl,
  rewriteResponse: env.rewriteResponse,
  tokens: {
    get: () => useSession.getState().tokens,
    set: (tokens) => useSession.getState().setTokens(tokens),
  },
  headers: () => ({
    'X-TK-Platform': platform(),
    'X-TK-App-Version': appVersion,
    'Accept-Language': usePrefs.getState().locale,
  }),
  onSessionEnded: (reason) => {
    useSession.getState().sessionEnded(reason);
    queryClient.clear();
  },
  onMaintenance: () => {
    void queryClient.invalidateQueries({ queryKey: ['config'] });
  },
});
