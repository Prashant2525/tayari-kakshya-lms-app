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
  return `http://${host || 'localhost'}:${DEV_API_PORT}`;
}
