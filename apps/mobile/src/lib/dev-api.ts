/** Port of the local API in development (`pnpm --filter @tk/api dev`). */
const DEV_API_PORT = 4000;

/**
 * Development: the API runs on the same computer as the Expo dev server, so use that computer's address as the
 * device sees it — the browser's host on the web, the dev-server host (LAN address) in Expo Go / emulators.
 */
export function devApiOrigin(
  platform: string,
  webHost: string | undefined,
  devServerHostUri: string | undefined,
): string {
  // "localhost" may resolve to IPv6 (::1) first while the API listens on IPv4 only: use 127.0.0.1 directly.
  if (platform === 'web') {
    const host = !webHost || webHost === 'localhost' ? '127.0.0.1' : webHost;
    return `http://${host}:${DEV_API_PORT}`;
  }
  const host = devServerHostUri?.split(':')[0];
  // An Android emulator reached through `adb reverse` sees the computer as 10.0.2.2, not localhost.
  if (platform === 'android' && (!host || host === 'localhost' || host === '127.0.0.1')) {
    return `http://10.0.2.2:${DEV_API_PORT}`;
  }
  return `http://${host || 'localhost'}:${DEV_API_PORT}`;
}

const LOCAL_ORIGINS = [`http://localhost:${DEV_API_PORT}`, `http://127.0.0.1:${DEV_API_PORT}`];

/**
 * Development: the local API gives picture addresses on `http://localhost:4000` (PUBLIC_MEDIA_BASE_URL). On a phone
 * "localhost" is the phone itself, so point those addresses at the computer the app already reaches (`apiOrigin`).
 * Returns null when nothing needs changing. Release builds use the public media domain and never rewrite.
 */
export function localAddressRewriter(apiOrigin: string): ((text: string) => string) | null {
  if (!apiOrigin || LOCAL_ORIGINS.includes(apiOrigin)) return null;
  return (text) => LOCAL_ORIGINS.reduce((out, origin) => out.split(origin).join(apiOrigin), text);
}
