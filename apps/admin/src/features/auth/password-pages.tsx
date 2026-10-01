import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthLayout } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Alert } from '@/components/ui/primitives';
import { api, ApiError, errorMessage } from '@/lib/api';

const emailSchema = z.object({ email: z.string().trim().pipe(z.email('Enter a valid email')) });

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof emailSchema>>({ resolver: zodResolver(emailSchema) });

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await api.post('/auth/password/forgot', { email }, { noRetry: true });
      await navigate({ to: '/set-password', search: { email, sent: true } });
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a 6-digit code to set a new password.">
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field label="Email" error={form.formState.errors.email?.message}>
          {(a) => <Input {...a} {...form.register('email')} type="email" autoComplete="username" autoFocus />}
        </Field>
        <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
          Send code
        </Button>
        <Link
          to="/login"
          className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-text-secondary hover:text-text"
        >
          <ArrowLeft className="size-4" /> Back to sign in
        </Link>
      </form>
    </AuthLayout>
  );
}

const setPasswordSchema = z
  .object({
    email: z.string().trim().pipe(z.email('Enter a valid email')),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Enter the 6-digit code from the email'),
    newPassword: z.string().min(8, 'Use at least 8 characters').max(128),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

/** Used both by invited staff (first password) and by anyone resetting a forgotten password. */
export function SetPasswordPage() {
  const search = useSearch({ from: '/set-password' });
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof setPasswordSchema>>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { email: search.email ?? '' },
  });

  const onSubmit = form.handleSubmit(async ({ email, code, newPassword }) => {
    setError(null);
    try {
      await api.post('/auth/password/reset', { email, code, newPassword }, { noRetry: true });
      await navigate({ to: '/login', search: { reset: true } });
    } catch (err) {
      setError(
        err instanceof ApiError && ['OTP_INVALID', 'OTP_EXPIRED'].includes(err.code)
          ? 'That code is invalid or has expired. Request a new one.'
          : errorMessage(err),
      );
    }
  });

  return (
    <AuthLayout
      title="Set your password"
      subtitle="Enter the 6-digit code we emailed you and choose a password of at least 8 characters."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {search.sent ? (
          <Alert tone="primary" title="Check your email">
            If an account exists for that address, a code is on its way. It expires in 10 minutes.
          </Alert>
        ) : null}
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field label="Email" error={form.formState.errors.email?.message}>
          {(a) => <Input {...a} {...form.register('email')} type="email" autoComplete="username" />}
        </Field>
        <Field label="6-digit code" error={form.formState.errors.code?.message}>
          {(a) => (
            <Input {...a} {...form.register('code')} inputMode="numeric" autoComplete="one-time-code" />
          )}
        </Field>
        <Field label="New password" error={form.formState.errors.newPassword?.message}>
          {(a) => (
            <Input {...a} {...form.register('newPassword')} type="password" autoComplete="new-password" />
          )}
        </Field>
        <Field label="Confirm new password" error={form.formState.errors.confirm?.message}>
          {(a) => <Input {...a} {...form.register('confirm')} type="password" autoComplete="new-password" />}
        </Field>
        <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
          Set password
        </Button>
        <p className="text-center text-sm text-text-secondary">
          Need a new code?{' '}
          <Link to="/forgot-password" className="font-semibold text-link hover:underline">
            Send another
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
