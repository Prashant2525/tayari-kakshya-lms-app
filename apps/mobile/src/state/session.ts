import type { AuthTokens } from '@tk/contracts';
import { create } from 'zustand';
import { secureStore } from '@/lib/secure-store';

const KEY = 'tk.session';

interface SessionState {
  status: 'loading' | 'signedOut' | 'signedIn';
  tokens: AuthTokens | null;
  /** Why the last session ended without the student logging out (shown once on the login screen). */
  endedReason: string | null;
  /** Just registered: offer verification before anything else (until verified, skipped or signed out). */
  verifyPrompt: boolean;
  load(): Promise<void>;
  setTokens(tokens: AuthTokens | null): Promise<void>;
  sessionEnded(reason: string): void;
  clearEndedReason(): void;
  setVerifyPrompt(value: boolean): void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  tokens: null,
  endedReason: null,
  verifyPrompt: false,
  async load() {
    let tokens = await secureStore
      .get(KEY)
      .then((raw) => (raw ? (JSON.parse(raw) as AuthTokens) : null))
      .catch(() => null);
    // A refresh token past its expiry cannot be used: start signed out.
    if (tokens && Date.parse(tokens.refreshTokenExpiresAt) <= Date.now()) tokens = null;
    set({ tokens, status: tokens ? 'signedIn' : 'signedOut' });
  },
  async setTokens(tokens) {
    set({
      tokens,
      status: tokens ? 'signedIn' : 'signedOut',
      ...(tokens ? { endedReason: null } : { verifyPrompt: false }),
    });
    if (tokens) await secureStore.set(KEY, JSON.stringify(tokens));
    else await secureStore.remove(KEY);
  },
  sessionEnded(reason) {
    set({ endedReason: reason });
  },
  clearEndedReason() {
    set({ endedReason: null });
  },
  setVerifyPrompt(value) {
    set({ verifyPrompt: value });
  },
}));
