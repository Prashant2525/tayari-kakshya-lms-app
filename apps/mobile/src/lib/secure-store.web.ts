/**
 * Web build only (development and browser tests; students use the native apps and the Next.js website).
 * Browsers have no secure enclave, so this falls back to localStorage.
 */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const secureStore = {
  get: async (key: string) => storage()?.getItem(key) ?? null,
  set: async (key: string, value: string) => storage()?.setItem(key, value),
  remove: async (key: string) => storage()?.removeItem(key),
};
