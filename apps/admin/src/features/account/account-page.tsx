import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, ShieldCheck, ShieldOff } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { Alert, Badge, Card, CardHeader } from '@/components/ui/primitives';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const nameSchema = z.object({ fullName: z.string().trim().min(2, 'Use at least 2 characters').max(120) });

function ProfileCard() {
  const { me, reloadMe } = useAuth();
  const form = useForm<z.infer<typeof nameSchema>>({
    resolver: zodResolver(nameSchema),
    values: { fullName: me?.fullName ?? '' },
  });
  const onSubmit = form.handleSubmit(async ({ fullName }) => {
    try {
      await api.patch('/me', { fullName });
      await reloadMe();
      toast.success('Profile updated');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });
  return (
    <Card>
      <CardHeader title="Profile" description={me?.email ?? undefined} />
      <form onSubmit={onSubmit} className="flex items-end gap-3 px-5 py-4" noValidate>
        <Field label="Full name" error={form.formState.errors.fullName?.message} className="flex-1">
          {(a) => <Input {...a} {...form.register('fullName')} autoComplete="name" />}
        </Field>
        <Button
          type="submit"
          variant="secondary"
          loading={form.formState.isSubmitting}
          disabled={!form.formState.isDirty}
        >
          Save
        </Button>
      </form>
    </Card>
  );
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'Use at least 8 characters').max(128),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

function PasswordCard() {
  const form = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) });
  const [error, setError] = useState<string | null>(null);
  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    setError(null);
    try {
      await api.post('/me/password', { currentPassword, newPassword });
      form.reset({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed. Your other sessions were signed out.');
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'INVALID_CREDENTIALS'
          ? 'Your current password is incorrect.'
          : errorMessage(err),
      );
    }
  });
  return (
    <Card>
      <CardHeader title="Password" description="Changing it signs you out everywhere else." />
      <form onSubmit={onSubmit} className="grid gap-4 px-5 py-4" noValidate>
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field label="Current password" error={form.formState.errors.currentPassword?.message}>
          {(a) => (
            <Input
              {...a}
              {...form.register('currentPassword')}
              type="password"
              autoComplete="current-password"
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password" error={form.formState.errors.newPassword?.message}>
            {(a) => (
              <Input {...a} {...form.register('newPassword')} type="password" autoComplete="new-password" />
            )}
          </Field>
          <Field label="Confirm new password" error={form.formState.errors.confirm?.message}>
            {(a) => (
              <Input {...a} {...form.register('confirm')} type="password" autoComplete="new-password" />
            )}
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={form.formState.isSubmitting}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join('\n');
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="success" title="Two-factor authentication is on">
        Save these recovery codes somewhere safe. Each works once if you lose your phone. They will not be
        shown again.
      </Alert>
      <ul
        className="grid grid-cols-2 gap-2 rounded-sm border border-border bg-surface-muted p-4 font-mono text-sm"
        aria-label="Recovery codes"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => toast.success('Recovery codes copied'));
          }}
        >
          <Copy /> Copy
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([`Tayari Kakshya admin recovery codes\n\n${text}\n`], { type: 'text/plain' }),
            );
            const a = document.createElement('a');
            a.href = url;
            a.download = 'tayari-kakshya-recovery-codes.txt';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download /> Download
        </Button>
        <Button onClick={onDone} className="ml-auto">
          I have saved them
        </Button>
      </div>
    </div>
  );
}

function MfaSetup({ onEnabled }: { onEnabled: (codes: string[]) => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const form = useForm<z.infer<typeof codeSchema>>({ resolver: zodResolver(codeSchema) });

  useEffect(() => {
    if (!setup) return;
    void QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 200 }).then(setQr);
  }, [setup]);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      setSetup(await api.post<{ secret: string; otpauthUrl: string }>('/admin/me/mfa/setup'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStarting(false);
    }
  };

  const onSubmit = form.handleSubmit(async ({ code }) => {
    setError(null);
    try {
      const res = await api.post<{ recoveryCodes: string[] }>('/admin/me/mfa/enable', { code });
      onEnabled(res.recoveryCodes);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'MFA_INVALID'
          ? 'That code did not match. Check the time on your phone and try again.'
          : errorMessage(err),
      );
      form.resetField('code');
    }
  });

  if (!setup) {
    return (
      <div className="flex flex-col items-start gap-3">
        {error ? <Alert tone="danger" title={error} /> : null}
        <p className="text-sm text-text-secondary">
          Use an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password. After
          your password, you will enter a 6-digit code from the app.
        </p>
        <Button onClick={() => void start()} loading={starting}>
          <ShieldCheck /> Set up two-factor authentication
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5 md:grid-cols-[auto_1fr]" noValidate>
      <div className="grid place-items-center rounded-md border border-border bg-white p-3">
        {qr ? (
          <img src={qr} alt="QR code for your authenticator app" width={200} height={200} />
        ) : (
          <div className="size-[200px]" />
        )}
      </div>
      <div className="flex flex-col gap-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-text-secondary">
          <li>Open your authenticator app and scan the QR code.</li>
          <li>Enter the 6-digit code it shows.</li>
        </ol>
        <p className="text-xs text-text-muted">
          Can&apos;t scan? Enter this key manually:{' '}
          <code className="break-all font-mono text-text">{setup.secret}</code>
        </p>
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field label="6-digit code" error={form.formState.errors.code?.message}>
          {(a) => (
            <Input
              {...a}
              {...form.register('code')}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="max-w-40 text-center tracking-[0.25em]"
            />
          )}
        </Field>
        <div>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Verify and turn on
          </Button>
        </div>
      </div>
    </form>
  );
}

function DisableMfaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { reloadMe } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ code: string }>();
  const onSubmit = form.handleSubmit(async ({ code }) => {
    setError(null);
    try {
      await api.delete('/admin/me/mfa', { code: code.trim() });
      await reloadMe();
      toast.success('Two-factor authentication turned off');
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Turn off two-factor authentication?"
      description="Enter a current code from your app or a recovery code to confirm."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void onSubmit()} loading={form.formState.isSubmitting}>
            Turn off
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field label="Code">
          {(a) => (
            <Input {...a} {...form.register('code', { required: true })} autoComplete="one-time-code" />
          )}
        </Field>
      </form>
    </Dialog>
  );
}

function SecurityCard() {
  const { me, reloadMe } = useAuth();
  const qc = useQueryClient();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const status = useQuery({
    queryKey: ['mfa-status'],
    queryFn: () => api.get<{ setupRequired: boolean; remainingRecoveryCodes: number }>('/admin/me/mfa'),
    enabled: Boolean(me?.mfaEnabled),
  });

  return (
    <Card>
      <CardHeader
        title="Two-factor authentication"
        description="A second step at sign-in using your phone."
        actions={
          me?.mfaEnabled || codes ? <Badge tone="success">On</Badge> : <Badge tone="warning">Off</Badge>
        }
      />
      <div className="px-5 py-4">
        {codes ? (
          <RecoveryCodes
            codes={codes}
            onDone={() => {
              setCodes(null);
              void qc.invalidateQueries({ queryKey: ['mfa-status'] });
            }}
          />
        ) : me?.mfaEnabled ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-secondary">
              Your account is protected.{' '}
              {status.data ? `${status.data.remainingRecoveryCodes} unused recovery codes left.` : null}
            </p>
            <Button variant="secondary" onClick={() => setDisableOpen(true)}>
              <ShieldOff /> Turn off
            </Button>
          </div>
        ) : (
          <MfaSetup
            onEnabled={(recovery) => {
              setCodes(recovery);
              void reloadMe();
            }}
          />
        )}
      </div>
      <DisableMfaDialog open={disableOpen} onOpenChange={setDisableOpen} />
    </Card>
  );
}

export function AccountPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[26px] font-bold leading-8 tracking-tight text-text">My account & security</h1>
        <p className="mt-1 text-[15px] text-text-secondary">Manage how you sign in to the admin panel.</p>
      </div>
      <SecurityCard />
      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileCard />
        <PasswordCard />
      </div>
    </div>
  );
}
