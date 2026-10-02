import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthLayout } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Alert } from '@/components/ui/primitives';
import { ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const credentialsSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email').pipe(z.email('Enter a valid email')),
  password: z.string().min(1, 'Enter your password'),
});
const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^(\d{6}|[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4})$/, 'Enter the 6-digit code or a recovery code'),
});

function safeNext(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export function LoginPage() {
  const { status, login, completeMfa } = useAuth();
  const { next, reset } = useSearch({ from: '/login' });
  const navigate = useNavigate();
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const credentials = useForm<z.infer<typeof credentialsSchema>>({
    resolver: zodResolver(credentialsSchema),
  });
  const mfa = useForm<z.infer<typeof codeSchema>>({ resolver: zodResolver(codeSchema) });

  if (status === 'authenticated') return <Navigate to={safeNext(next)} />;

  const onCredentials = credentials.handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      const result = await login(email, password);
      if (result.mfaRequired && result.mfaToken) setMfaToken(result.mfaToken);
      else await navigate({ to: safeNext(next) });
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'INVALID_CREDENTIALS'
          ? 'Email or password is incorrect.'
          : errorMessage(err),
      );
    }
  });

  const onCode = mfa.handleSubmit(async ({ code }) => {
    if (!mfaToken) return;
    setError(null);
    try {
      await completeMfa(mfaToken, code);
      await navigate({ to: safeNext(next) });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MFA_INVALID' && /expired/i.test(err.message)) {
        setMfaToken(null);
      }
      setError(errorMessage(err));
      mfa.resetField('code');
    }
  });

  if (mfaToken) {
    return (
      <AuthLayout
        title="Two-factor verification"
        subtitle="Enter the 6-digit code from your authenticator app."
      >
        <form key="mfa" onSubmit={onCode} className="flex flex-col gap-5" noValidate>
          {error ? <Alert tone="danger" title={error} /> : null}
          <Field
            label="Authentication code"
            error={mfa.formState.errors.code?.message}
            hint="Lost your device? Use one of your recovery codes."
          >
            {(a) => (
              <Input
                {...a}
                {...mfa.register('code')}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="123456"
                className="text-center text-lg tracking-[0.3em]"
              />
            )}
          </Field>
          <Button type="submit" size="lg" loading={mfa.formState.isSubmitting}>
            Verify and sign in
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMfaToken(null)}>
            <ArrowLeft /> Use a different account
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back. Sign in with your staff account.">
      <form key="credentials" onSubmit={onCredentials} className="flex flex-col gap-5" noValidate>
        {reset && !error ? (
          <Alert tone="success" title="Password set. Sign in with your new password." />
        ) : null}
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field label="Email" error={credentials.formState.errors.email?.message}>
          {(a) => (
            <Input {...a} {...credentials.register('email')} type="email" autoComplete="username" autoFocus />
          )}
        </Field>
        <Field label="Password" error={credentials.formState.errors.password?.message}>
          {(a) => (
            <div className="relative">
              <Input
                {...a}
                {...credentials.register('password')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 grid w-10 place-items-center text-text-muted hover:text-text"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          )}
        </Field>
        <div className="-mt-2 flex justify-end">
          <Link to="/forgot-password" className="text-sm font-semibold text-link hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" loading={credentials.formState.isSubmitting}>
          Sign in
        </Button>
        <p className="text-center text-sm text-text-secondary">
          Invited to the team?{' '}
          <Link to="/set-password" className="font-semibold text-link hover:underline">
            Set your password
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
