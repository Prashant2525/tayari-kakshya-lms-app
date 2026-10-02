import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, ShieldCheck, UserPlus } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import {
  Alert,
  Avatar,
  Badge,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
} from '@/components/ui/primitives';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatRelative } from '@/lib/format';
import { useRoles, type Role } from './roles-pages';
import { ScopesDialog } from './scopes-dialog';

interface StaffMember {
  id: string;
  fullName: string;
  email: string | null;
  status: 'active' | 'suspended' | 'pending_deletion' | 'deleted';
  hasPassword: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  roles: Array<{ id: string; name: string; isSystem: boolean }>;
}

function RolePicker({
  roles,
  value,
  onChange,
}: {
  roles: Role[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { me } = useAuth();
  return (
    <div className="grid gap-2">
      {roles.map((role) => {
        const id = `role-${role.id}`;
        const allowed =
          me?.isSuperAdmin || (!role.isSystem && role.permissions.every((p) => me?.permissions.includes(p)));
        return (
          <label
            key={role.id}
            htmlFor={id}
            className={`flex items-start gap-3 rounded-sm border border-border p-3 ${allowed ? 'cursor-pointer hover:bg-surface-muted' : 'opacity-55'}`}
          >
            <Checkbox
              id={id}
              checked={value.includes(role.id)}
              disabled={!allowed}
              onCheckedChange={(v) => onChange(v ? [...value, role.id] : value.filter((x) => x !== role.id))}
            />
            <span>
              <span className="block text-sm font-semibold text-text">{role.name}</span>
              <span className="block text-xs text-text-muted">
                {role.isSystem
                  ? 'Full access'
                  : (role.description ?? `${role.permissions.length} permissions`)}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

const inviteSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter their full name').max(120),
  email: z.string().trim().pipe(z.email('Enter a valid email')),
  roleIds: z.array(z.string()),
});

function InviteDialog({
  open,
  onOpenChange,
  roles,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roles: Role[];
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { fullName: '', email: '', roleIds: [] },
  });
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post('/admin/staff', values);
      await qc.invalidateQueries({ queryKey: ['staff'] });
      toast.success(`Invitation sent to ${values.email}`);
      form.reset();
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invite a staff member"
      description="They receive an email with a code to set their own password. You never see or choose it."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} loading={form.formState.isSubmitting}>
            Send invitation
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field label="Full name" error={form.formState.errors.fullName?.message}>
          {(a) => <Input {...a} {...form.register('fullName')} />}
        </Field>
        <Field label="Work email" error={form.formState.errors.email?.message}>
          {(a) => <Input {...a} {...form.register('email')} type="email" />}
        </Field>
        <div>
          <p className="mb-2 text-sm font-semibold text-text">Roles</p>
          <Controller
            control={form.control}
            name="roleIds"
            render={({ field }) => <RolePicker roles={roles} value={field.value} onChange={field.onChange} />}
          />
        </div>
      </form>
    </Dialog>
  );
}

function RolesDialog({
  member,
  roles,
  onClose,
}: {
  member: StaffMember;
  roles: Role[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(member.roles.map((r) => r.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Roles for ${member.fullName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api.put(`/admin/staff/${member.id}/roles`, { roleIds: value });
                await qc.invalidateQueries({ queryKey: ['staff'] });
                await qc.invalidateQueries({ queryKey: ['roles'] });
                toast.success('Roles updated');
                onClose();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save roles
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-4">
          <Alert tone="danger" title={error} />
        </div>
      ) : null}
      <RolePicker roles={roles} value={value} onChange={setValue} />
    </Dialog>
  );
}

export function StaffPage() {
  const { can, me } = useAuth();
  const qc = useQueryClient();
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api.get<StaffMember[]>('/admin/staff') });
  const roles = useRoles();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [scoping, setScoping] = useState<StaffMember | null>(null);
  const [statusChange, setStatusChange] = useState<{
    member: StaffMember;
    to: 'suspend' | 'reactivate';
  } | null>(null);
  const manage = can('staff:manage');

  return (
    <>
      <PageHeader
        title="Staff"
        description="People who can sign in to this admin panel, and what they can do."
        actions={
          manage ? (
            <Button onClick={() => setInviteOpen(true)} disabled={!roles.data}>
              <UserPlus /> Invite staff
            </Button>
          ) : undefined
        }
      />
      <Card>
        {staff.isPending ? (
          <Spinner />
        ) : staff.isError ? (
          <ErrorState error={staff.error} onRetry={() => void staff.refetch()} />
        ) : staff.data.length === 0 ? (
          <EmptyState title="No staff yet" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Roles</TH>
                <TH>Security</TH>
                <TH>Last sign-in</TH>
                {manage ? (
                  <TH className="w-12">
                    <span className="sr-only">Actions</span>
                  </TH>
                ) : null}
              </TR>
            </THead>
            <TBody>
              {staff.data.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={m.fullName} className="size-8" />
                      <div className="min-w-0">
                        <p className="font-semibold text-text">
                          {m.fullName}{' '}
                          {m.id === me?.id ? (
                            <span className="font-normal text-text-muted">(you)</span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-text-muted">{m.email}</p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {m.roles.length === 0 ? <span className="text-text-muted">No roles</span> : null}
                      {m.roles.map((r) => (
                        <Badge key={r.id} tone={r.isSystem ? 'primary' : 'neutral'}>
                          {r.name}
                        </Badge>
                      ))}
                    </div>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {m.status === 'suspended' ? <Badge tone="danger">Suspended</Badge> : null}
                      {!m.hasPassword ? <Badge tone="warning">Invitation pending</Badge> : null}
                      {m.mfaEnabled ? (
                        <Badge tone="success">
                          <ShieldCheck className="size-3" aria-hidden /> 2FA
                        </Badge>
                      ) : m.hasPassword ? (
                        <Badge>No 2FA</Badge>
                      ) : null}
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap text-text-secondary">{formatRelative(m.lastLoginAt)}</TD>
                  {manage ? (
                    <TD>
                      {m.id !== me?.id ? (
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${m.fullName}`}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              align="end"
                              className="z-50 min-w-44 rounded-md border border-border bg-surface-raised p-1 shadow-e2"
                            >
                              <DropdownMenu.Item
                                className="cursor-pointer rounded-sm px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-muted"
                                onSelect={() => setEditing(m)}
                              >
                                Change roles
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                className="cursor-pointer rounded-sm px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-muted"
                                onSelect={() => setScoping(m)}
                              >
                                Limit content access
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                className="cursor-pointer rounded-sm px-2.5 py-2 text-sm text-danger outline-none data-[highlighted]:bg-surface-muted"
                                onSelect={() =>
                                  setStatusChange({
                                    member: m,
                                    to: m.status === 'suspended' ? 'reactivate' : 'suspend',
                                  })
                                }
                              >
                                {m.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      ) : null}
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {roles.data ? <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} roles={roles.data} /> : null}
      {editing && roles.data ? (
        <RolesDialog member={editing} roles={roles.data} onClose={() => setEditing(null)} />
      ) : null}
      {scoping ? <ScopesDialog member={scoping} onClose={() => setScoping(null)} /> : null}
      {statusChange ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setStatusChange(null)}
          title={`${statusChange.to === 'suspend' ? 'Suspend' : 'Reactivate'} ${statusChange.member.fullName}?`}
          description={
            statusChange.to === 'suspend'
              ? 'They are signed out immediately and cannot sign in until reactivated.'
              : 'They will be able to sign in again with their existing roles.'
          }
          confirmLabel={statusChange.to === 'suspend' ? 'Suspend' : 'Reactivate'}
          tone={statusChange.to === 'suspend' ? 'danger' : 'primary'}
          onConfirm={async () => {
            await api.patch(`/admin/staff/${statusChange.member.id}/${statusChange.to}`);
            await qc.invalidateQueries({ queryKey: ['staff'] });
            toast.success(
              statusChange.to === 'suspend' ? 'Staff member suspended' : 'Staff member reactivated',
            );
          }}
        />
      ) : null}
    </>
  );
}
