import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Lock, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
} from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount?: number;
}

interface PermissionInfo {
  name: string;
  description: string;
}

const GROUP_LABELS: Record<string, string> = {
  users: 'Students',
  staff: 'Staff',
  roles: 'Roles',
  settings: 'System settings',
  audit: 'Audit log',
  education_levels: 'Profile options',
  home: 'Home screen',
  campaigns: 'Campaigns',
};

export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => api.get<Role[]>('/admin/roles') });
}

export function RolesPage() {
  const roles = useRoles();
  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="Group permissions into roles, then assign roles to staff. Nobody can grant a permission they do not hold."
        actions={
          <Button asChild>
            <Link to="/roles/new">
              <Plus /> New role
            </Link>
          </Button>
        }
      />
      {roles.isPending ? (
        <Spinner />
      ) : roles.isError ? (
        <Card>
          <ErrorState error={roles.error} onRetry={() => void roles.refetch()} />
        </Card>
      ) : roles.data.length === 0 ? (
        <Card>
          <EmptyState title="No roles yet" />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {roles.data.map((role) => (
            <Card key={role.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-[17px] font-semibold text-text">
                    {role.name}{' '}
                    {role.isSystem ? (
                      <Lock className="size-4 text-text-muted" aria-label="Protected role" />
                    ) : null}
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">{role.description ?? 'No description'}</p>
                </div>
                <Badge tone={role.isSystem ? 'primary' : 'neutral'}>{role.userCount ?? 0} staff</Badge>
              </div>
              <p className="mt-4 text-sm text-text-muted">
                {role.isSystem
                  ? 'All permissions, always.'
                  : `${role.permissions.length} permission${role.permissions.length === 1 ? '' : 's'}`}
              </p>
              {!role.isSystem ? (
                <div className="mt-4">
                  <Button asChild variant="secondary" size="sm">
                    <Link to="/roles/$roleId" params={{ roleId: role.id }}>
                      Edit role
                    </Link>
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

const roleSchema = z.object({
  name: z.string().trim().min(2, 'Use at least 2 characters').max(60),
  description: z.string().trim().max(300),
  permissions: z.array(z.string()),
});
type RoleForm = z.infer<typeof roleSchema>;

export function RoleEditorPage() {
  const params = useParams({ strict: false }) as { roleId?: string };
  const roleId = params.roleId;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { me } = useAuth();
  const roles = useRoles();
  const catalog = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.get<PermissionInfo[]>('/admin/permissions'),
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const role = roleId ? roles.data?.find((r) => r.id === roleId) : undefined;

  const form = useForm<RoleForm>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: '', description: '', permissions: [] },
  });
  useEffect(() => {
    if (role)
      form.reset({ name: role.name, description: role.description ?? '', permissions: role.permissions });
  }, [role, form]);

  const grouped = useMemo(() => {
    const groups = new Map<string, PermissionInfo[]>();
    for (const p of catalog.data ?? []) {
      const key = p.name.split(':')[0] ?? 'other';
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    return [...groups.entries()];
  }, [catalog.data]);

  const canGrant = (permission: string) => Boolean(me?.isSuperAdmin || me?.permissions.includes(permission));

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const body = {
      name: values.name,
      description: values.description || null,
      permissions: values.permissions,
    };
    try {
      if (roleId) await api.put(`/admin/roles/${roleId}`, body);
      else await api.post('/admin/roles', body);
      await qc.invalidateQueries({ queryKey: ['roles'] });
      toast.success(roleId ? 'Role updated' : 'Role created');
      await navigate({ to: '/roles' });
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  if (roles.isPending || catalog.isPending) return <Spinner />;
  if (catalog.isError) return <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />;
  if (roleId && !role) return <ErrorState error={new Error('This role no longer exists.')} />;

  return (
    <>
      <Link
        to="/roles"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" /> All roles
      </Link>
      <PageHeader
        title={roleId ? `Edit ${role?.name}` : 'New role'}
        actions={
          roleId ? (
            <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </Button>
          ) : undefined
        }
      />
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {error ? <Alert tone="danger" title={error} /> : null}
        <Card className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Role name" error={form.formState.errors.name?.message}>
            {(a) => <Input {...a} {...form.register('name')} placeholder="e.g. Content Manager" />}
          </Field>
          <Field
            label="Description"
            hint="Optional. Helps other admins pick the right role."
            error={form.formState.errors.description?.message}
          >
            {(a) => <Input {...a} {...form.register('description')} />}
          </Field>
        </Card>
        <Card>
          <CardHeader
            title="Permissions"
            description="Greyed-out permissions are ones you do not hold, so you cannot grant them."
          />
          <Controller
            control={form.control}
            name="permissions"
            render={({ field }) => (
              <div className="divide-y divide-border">
                {grouped.map(([group, perms]) => (
                  <fieldset key={group} className="px-5 py-4">
                    <legend className="mb-2 text-sm font-semibold text-text">
                      {GROUP_LABELS[group] ?? group}
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {perms.map((p) => {
                        const id = `perm-${p.name}`;
                        const checked = field.value.includes(p.name);
                        const allowed = canGrant(p.name);
                        return (
                          <label
                            key={p.name}
                            htmlFor={id}
                            className={`flex items-start gap-3 rounded-sm p-2 ${allowed ? 'cursor-pointer hover:bg-surface-muted' : 'opacity-55'}`}
                          >
                            <Checkbox
                              id={id}
                              checked={checked}
                              disabled={!allowed}
                              onCheckedChange={(v) =>
                                field.onChange(
                                  v ? [...field.value, p.name] : field.value.filter((x) => x !== p.name),
                                )
                              }
                            />
                            <span>
                              <span className="block text-sm text-text">{p.description}</span>
                              <code className="text-xs text-text-muted">{p.name}</code>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            )}
          />
        </Card>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={() => void navigate({ to: '/roles' })}>
            Cancel
          </Button>
          <Button type="submit" loading={form.formState.isSubmitting}>
            {roleId ? 'Save changes' : 'Create role'}
          </Button>
        </div>
      </form>
      {roleId ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete ${role?.name}?`}
          description="Roles that are still assigned to staff cannot be deleted. This action is recorded in the audit log."
          confirmLabel="Delete role"
          onConfirm={async () => {
            await api.delete(`/admin/roles/${roleId}`);
            await qc.invalidateQueries({ queryKey: ['roles'] });
            toast.success('Role deleted');
            await navigate({ to: '/roles' });
          }}
        />
      ) : null}
    </>
  );
}
