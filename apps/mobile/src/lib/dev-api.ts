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
  if (platform === 'web') return `http://${webHost || 'localhost'}:${DEV_API_PORT}`;
  const host = devServerHostUri?.split(':')[0];
  return `http://${host || 'localhost'}:${DEV_API_PORT}`;
}
