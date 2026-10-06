'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  forgotAction,
  registerAction,
  resendAction,
  resetAction,
  signInAction,
  verifyAction,
  type AuthFormState,
} from '@/app/actions/auth';
import { useT } from './i18n-provider';
import { Alert, button, Field, input } from './ui';

const idle: AuthFormState = { error: null };

function Message({ state }: { state: AuthFormState }) {
  const { t } = useT();
  if ('done' in state) return <Alert tone="success">{t(state.done)}</Alert>;
  if (!state.error || state.error === 'device_limit') return null;
  return <Alert>{t(state.error)}</Alert>;
}

export function SignInForm({ next }: { next: string }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(signInAction, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Message state={state} />
      <Field label={t('auth.email')}>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.typed?.email ?? ''}
          className={input}
        />
      </Field>
      <Field label={t('auth.password')}>
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </Field>
      {'error' in state && state.error === 'device_limit' ? (
        <div className="flex flex-col gap-2 rounded-md bg-warning-soft p-4 text-sm text-text">
          <p>{t('auth.deviceLimit', { count: state.max })}</p>
          {state.sessions.map((s) => (
            <button
              key={s.id}
              name="replaceSessionId"
              value={s.id}
              className={button.secondary}
              disabled={pending}
            >
              {t('auth.signOutDevice', { name: s.deviceName ?? '—' })}
            </button>
          ))}
        </div>
      ) : null}
      <button className={button.primary} disabled={pending}>
        {t('auth.signIn')}
      </button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/forgot-password" className={button.link}>
          {t('auth.forgot')}
        </Link>
        <span className="text-text-secondary">
          {t('auth.noAccount')}{' '}
          <Link href={`/register?next=${encodeURIComponent(next)}`} className={button.link}>
            {t('auth.createAccount')}
          </Link>
        </span>
      </div>
    </form>
  );
}

export function RegisterForm({ next }: { next: string }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(registerAction, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Message state={state} />
      <Field label={t('auth.fullName')}>
        <input
          name="fullName"
          defaultValue={state.typed?.fullName ?? ''}
          autoComplete="name"
          required
          minLength={2}
          maxLength={120}
          className={input}
        />
      </Field>
      <Field label={t('auth.email')}>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.typed?.email ?? ''}
          className={input}
        />
      </Field>
      <Field label={t('auth.password')}>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={input}
        />
      </Field>
      <label className="flex items-start gap-3 text-sm text-text">
        <input
          type="checkbox"
          name="acceptTerms"
          required
          className="mt-1 size-5 accent-[var(--tk-primary)]"
        />
        <span>{t('auth.acceptTerms')}</span>
      </label>
      <button className={button.primary} disabled={pending}>
        {t('auth.register')}
      </button>
      <p className="text-sm text-text-secondary">
        {t('auth.haveAccount')}{' '}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className={button.link}>
          {t('auth.signIn')}
        </Link>
      </p>
    </form>
  );
}

export function VerifyForm({ next }: { next: string }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(verifyAction, idle);
  const [resent, resend, resending] = useActionState(resendAction, idle);
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <Message state={state} />
        <Field label={t('auth.code')}>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            className={`${input} tracking-[0.4em]`}
          />
        </Field>
        <button className={button.primary} disabled={pending}>
          {t('auth.verify')}
        </button>
      </form>
      <form action={resend} className="flex flex-wrap items-center justify-between gap-3">
        <button className={button.link} disabled={resending}>
          {t('auth.resend')}
        </button>
        <Link href={next} className={button.link}>
          {t('auth.skip')}
        </Link>
      </form>
      <Message state={resent} />
    </div>
  );
}

export function ForgotForm() {
  const { t } = useT();
  const [state, action, pending] = useActionState(forgotAction, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Message state={state} />
      <Field label={t('auth.email')}>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.typed?.email ?? ''}
          className={input}
        />
      </Field>
      <button className={button.primary} disabled={pending}>
        {t('auth.sendCode')}
      </button>
    </form>
  );
}

export function ResetForm({ email }: { email: string }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(resetAction, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="email" value={email} />
      <Message state={state} />
      <Field label={t('auth.code')}>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          className={input}
        />
      </Field>
      <Field label={t('auth.newPassword')}>
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={input}
        />
      </Field>
      <button className={button.primary} disabled={pending}>
        {t('auth.reset')}
      </button>
    </form>
  );
}
