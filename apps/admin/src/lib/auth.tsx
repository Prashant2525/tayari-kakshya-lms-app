import type { MeView, Permission } from '@tk/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, refreshSession, setAccessToken, setSessionLostHandler } from './api';

type Status = 'loading' | 'anonymous' | 'authenticated';

interface LoginResult {
  mfaRequired: boolean;
  mfaToken?: string;
}

interface AuthContextValue {
  status: Status;
  me: MeView | null;
  login(email: string, password: string): Promise<LoginResult>;
  completeMfa(mfaToken: string, code: string): Promise<void>;
  logout(): Promise<void>;
  reloadMe(): Promise<MeView | null>;
  can(permission: Permission): boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<MeView | null>(null);
  const queryClient = useQueryClient();

  const signOutLocally = useCallback(() => {
    setAccessToken(null);
    setMe(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  const reloadMe = useCallback(async () => {
    try {
      const profile = await api.get<MeView>('/me');
      if (profile.kind !== 'staff') {
        signOutLocally();
        return null;
      }
      setMe(profile);
      setStatus('authenticated');
      return profile;
    } catch {
      signOutLocally();
      return null;
    }
  }, [signOutLocally]);

  // Restore the session from the refresh cookie on first load.
  useEffect(() => {
    setSessionLostHandler(signOutLocally);
    void (async () => {
      if (await refreshSession()) await reloadMe();
      else setStatus('anonymous');
    })();
    return () => setSessionLostHandler(null);
  }, [reloadMe, signOutLocally]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      const res = await api.post<{ accessToken?: string; mfaRequired?: boolean; mfaToken?: string }>(
        '/admin/auth/login',
        { email, password },
        { noRetry: true },
      );
      if (res.mfaRequired) return { mfaRequired: true, mfaToken: res.mfaToken };
      setAccessToken(res.accessToken ?? null);
      await reloadMe();
      return { mfaRequired: false };
    },
    [reloadMe],
  );

  const completeMfa = useCallback(
    async (mfaToken: string, code: string) => {
      const res = await api.post<{ accessToken: string }>(
        '/admin/auth/login/mfa',
        { mfaToken, code },
        { noRetry: true },
      );
      setAccessToken(res.accessToken);
      await reloadMe();
    },
    [reloadMe],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/admin/auth/logout', undefined, { noRetry: true });
    } finally {
      signOutLocally();
    }
  }, [signOutLocally]);

  // Mirrors the server: while two-factor setup is required, no permission-protected action is usable.
  const can = useCallback(
    (permission: Permission) =>
      Boolean(me && !me.mfaSetupRequired && (me.isSuperAdmin || me.permissions.includes(permission))),
    [me],
  );

  const value = useMemo(
    () => ({ status, me, login, completeMfa, logout, reloadMe, can }),
    [status, me, login, completeMfa, logout, reloadMe, can],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
