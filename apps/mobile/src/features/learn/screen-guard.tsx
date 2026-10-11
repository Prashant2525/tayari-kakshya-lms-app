import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

const KEY = 'premium-content';

/**
 * Premium content (S20, D-067): screenshots and screen recording are blocked while this screen is in focus (Android
 * blocks them; iOS hides the content in screenshots and recordings). Focus, not mounting: a premium lesson left in the
 * back stack must not block screenshots of the screens opened on top of it.
 */
export function ScreenGuard() {
  useFocusEffect(
    useCallback(() => {
      void preventScreenCaptureAsync(KEY).catch(() => undefined);
      return () => void allowScreenCaptureAsync(KEY).catch(() => undefined);
    }, []),
  );
  return null;
}
