'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { serverEnv } from '@/lib/env';
import { ERROR_KEY, type MessageKey } from '@/lib/messages';
import { COOKIE, writeTokenCookies, type AuthTokens } from '@/lib/tokens';

export interface DeviceSession {
  id: string;
  deviceName: string | null;
  lastUsedAt: string;
}

/** What was typed (not passwords): React resets a form after its action, so it is filled in again from here. */
export interface Typed {
  email?: string;
  fullName?: string;
  referralCode?: string;
}

export type AuthFormState = (
  | { error: null }
  | { error: MessageKey }
  | { error: 'device_limit'; max: number; sessions: DeviceSession[] }
  | { done: MessageKey }
) & { typed?: Typed };

/** Only paths on this site (no `//host` or absolute addresses) are followed after signing in. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === 'string' ? value : '';
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/account';
}

function messageFor(err: unknown): MessageKey {
  if (err instanceof ApiError) return ERROR_KEY[err.code] ?? 'error.generic';
  return 'error.network';
}

/** This browser's id for the API's device list (D-028): random, kept for a year. */
async function device() {
  const jar = await cookies();
  let id = jar.get(COOKIE.device)?.value;
  if (!id) {
    id = `web-${randomUUID()}`;
    jar.set(COOKIE.device, id, {
      httpOnly: true,
      secure: serverEnv.secureCookies,
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 86_400,
    });
  }
  return { deviceId: id, deviceName: 'Web browser', platform: 'web' as const };
}

async function keep(tokens: AuthTokens) {
  writeTokenCookies(await cookies(), tokens, serverEnv.secureCookies);
}

export async function signInAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const replace = form.get('replaceSessionId');
  try {
    const tokens = await api<AuthTokens>('/auth/login', {
      method: 'POST',
      auth: false,
      body: {
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        device: await device(),
        ...(typeof replace === 'string' && replace ? { replaceSessionId: replace } : {}),
      },
    });
    await keep(tokens);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'DEVICE_LIMIT_REACHED') {
      const d = err.details as { maxActiveSessions: number; sessions: DeviceSession[] };
      return {
        error: 'device_limit',
        max: d.maxActiveSessions,
        sessions: d.sessions,
        typed: { email: String(form.get('email') ?? '') },
      };
    }
    return { error: messageFor(err), typed: { email: String(form.get('email') ?? '') } };
  }
  redirect(safeNext(form.get('next')));
}

export async function registerAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const next = safeNext(form.get('next'));
  const jar = await cookies();
  try {
    const tokens = await api<AuthTokens>('/auth/register', {
      method: 'POST',
      auth: false,
      body: {
        fullName: String(form.get('fullName') ?? ''),
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        acceptTerms: form.get('acceptTerms') === 'on',
        ...(String(form.get('referralCode') ?? '').trim()
          ? { referralCode: String(form.get('referralCode')).trim() }
          : {}),
        locale: jar.get(COOKIE.locale)?.value === 'ne' ? 'ne' : 'en',
        device: await device(),
      },
    });
    await keep(tokens);
  } catch (err) {
    return {
      error: messageFor(err),
      typed: {
        email: String(form.get('email') ?? ''),
        fullName: String(form.get('fullName') ?? ''),
        referralCode: String(form.get('referralCode') ?? ''),
      },
    };
  }
  // A code was emailed when email verification is on (CMS setting): ask for it, as the app does.
  const config = await api<{ verification: { channels: { email: boolean } } }>('/app/config', {
    auth: false,
  }).catch(() => null);
  redirect(config?.verification.channels.email ? `/verify?next=${encodeURIComponent(next)}` : next);
}

export async function verifyAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  try {
    await api('/me/verification/verify', {
      method: 'POST',
      body: { channel: 'email', code: String(form.get('code') ?? '').trim() },
    });
  } catch (err) {
    return { error: messageFor(err) };
  }
  redirect(safeNext(form.get('next')));
}

export async function resendAction(_prev: AuthFormState): Promise<AuthFormState> {
  try {
    await api('/me/verification/send', { method: 'POST', body: { channel: 'email' } });
    return { done: 'auth.resent' };
  } catch (err) {
    return { error: messageFor(err) };
  }
}

export async function forgotAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = String(form.get('email') ?? '').trim();
  try {
    await api('/auth/password/forgot', { method: 'POST', auth: false, body: { email } });
  } catch (err) {
    return { error: messageFor(err), typed: { email } };
  }
  redirect(`/reset-password?email=${encodeURIComponent(email)}`);
}

export async function resetAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  try {
    await api('/auth/password/reset', {
      method: 'POST',
      auth: false,
      body: {
        email: String(form.get('email') ?? ''),
        code: String(form.get('code') ?? '').trim(),
        newPassword: String(form.get('newPassword') ?? ''),
      },
    });
  } catch (err) {
    return { error: messageFor(err) };
  }
  redirect('/login?reset=1');
}

export async function signOutAction() {
  await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
  const jar = await cookies();
  jar.delete(COOKIE.access);
  jar.delete(COOKIE.refresh);
  redirect('/');
}

export async function setLocaleAction(locale: 'en' | 'ne') {
  (await cookies()).set(COOKIE.locale, locale, { sameSite: 'lax', path: '/', maxAge: 365 * 86_400 });
}
