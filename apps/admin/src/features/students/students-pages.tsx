import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, ChevronLeft, ChevronRight, LogOut, Search, ShieldBan, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  Spinner,
} from '@/components/ui/primitives';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateBs, formatDateTimeBs, formatRelative } from '@/lib/format';

type Status = 'active' | 'suspended' | 'pending_deletion' | 'deleted';

interface StudentRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: Status;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface Session {
  id: string;
  deviceName: string;
  platform: string;
  lastUsedAt: string;
  createdAt: string;
}

interface StudentDetail extends Omit<StudentRow, 'createdAt'> {
  locale: 'en' | 'ne';
  deviceLimitOverride: number | null;
  createdAt: string;
  sessions: Session[];
}

const STATUS_LABEL: Record<Status, { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }> = {
  active: { label: 'Active', tone: 'success' },
  suspended: { label: 'Suspended', tone: 'danger' },
  pending_deletion: { label: 'Deletion scheduled', tone: 'warning' },
  deleted: { label: 'Deleted', tone: 'neutral' },
};

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_LABEL[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function StudentsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | Status>('');
  const [cursors, setCursors] = useState<string[]>([]);
  const search = useDebounced(q.trim());
  const cursor = cursors.at(-1);

  const list = useQuery({
    queryKey: ['students', search, status, cursor],
    queryFn: ({ signal }) =>
      api.get<{ data: StudentRow[]; nextCursor: string | null }>(
        '/admin/users',
        { q: search, status, cursor, limit: 25 },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Students"
        description="Find student accounts, review their sessions and manage access."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <div className="relative min-w-60 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setCursors([]);
              }}
              placeholder="Search by name, email or phone"
              aria-label="Search students"
              className="pl-9"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as '' | Status);
              setCursors([]);
            }}
            aria-label="Filter by status"
            className="w-48"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="pending_deletion">Deletion scheduled</option>
            <option value="deleted">Deleted</option>
          </Select>
        </div>

        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : list.data.data.length === 0 ? (
          <EmptyState
            title={search || status ? 'No students match your filters' : 'No students yet'}
            description={
              search || status
                ? 'Try a different search or status.'
                : 'Students appear here as soon as they register in the app.'
            }
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Student</TH>
                  <TH>Phone</TH>
                  <TH>Status</TH>
                  <TH>Joined</TH>
                  <TH>Last sign-in</TH>
                </TR>
              </THead>
              <TBody>
                {list.data.data.map((s) => (
                  <TR key={s.id} className="hover:bg-surface-muted/50">
                    <TD>
                      <Link
                        to="/students/$studentId"
                        params={{ studentId: s.id }}
                        className="flex items-center gap-3"
                      >
                        <Avatar name={s.fullName} className="size-8" />
                        <span className="min-w-0">
                          <span className="block font-semibold text-text hover:underline">{s.fullName}</span>
                          <span className="block truncate text-xs text-text-muted">
                            {s.email ?? '—'} {s.email && !s.emailVerified ? '· unverified' : ''}
                          </span>
                        </span>
                      </Link>
                    </TD>
                    <TD className="text-text-secondary">{s.phone ?? '—'}</TD>
                    <TD>
                      <StatusBadge status={s.status} />
                    </TD>
                    <TD className="whitespace-nowrap text-text-secondary">{formatDateBs(s.createdAt)}</TD>
                    <TD className="whitespace-nowrap text-text-secondary">{formatRelative(s.lastLoginAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={cursors.length === 0}
                onClick={() => setCursors((c) => c.slice(0, -1))}
              >
                <ChevronLeft /> Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!list.data.nextCursor}
                onClick={() =>
                  list.data.nextCursor && setCursors((c) => [...c, list.data.nextCursor as string])
                }
              >
                Next <ChevronRight />
              </Button>
            </div>
          </>
        )}
      </Card>
    </>
  );
}

const deviceLimitSchema = z.object({
  override: z
    .string()
    .regex(/^$|^([1-9]|1\d|20)$/, 'Use a number from 1 to 20, or leave empty for the global limit'),
});

export function StudentDetailPage() {
  const { studentId } = useParams({ from: '/app/students/$studentId' });
  const { can } = useAuth();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<'suspend' | 'reactivate' | 'revoke' | null>(null);
  const detail = useQuery({
    queryKey: ['student', studentId],
    queryFn: () => api.get<StudentDetail>(`/admin/users/${studentId}`),
  });

  const form = useForm<z.infer<typeof deviceLimitSchema>>({ resolver: zodResolver(deviceLimitSchema) });
  useEffect(() => {
    if (detail.data) form.reset({ override: detail.data.deviceLimitOverride?.toString() ?? '' });
  }, [detail.data, form]);

  const saveLimit = useMutation({
    mutationFn: (override: number | null) =>
      api.patch(`/admin/users/${studentId}`, { deviceLimitOverride: override }),
    onSuccess: async () => {
      toast.success('Device limit updated');
      await qc.invalidateQueries({ queryKey: ['student', studentId] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['student', studentId] }),
      qc.invalidateQueries({ queryKey: ['students'] }),
    ]);

  if (detail.isPending) return <Spinner />;
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  const s = detail.data;

  return (
    <>
      <Link
        to="/students"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" /> All students
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={s.fullName} className="size-14 text-lg" />
          <div>
            <h1 className="text-[24px] font-bold leading-8 text-text">{s.fullName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
              <StatusBadge status={s.status} />
              <span>Joined {formatDateBs(s.createdAt)}</span>
            </div>
          </div>
        </div>
        {can('users:suspend') && s.status !== 'deleted' ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setConfirm('revoke')}
              disabled={s.sessions.length === 0}
            >
              <LogOut /> Sign out everywhere
            </Button>
            {s.status === 'suspended' ? (
              <Button variant="primary" onClick={() => setConfirm('reactivate')}>
                <ShieldCheck /> Reactivate
              </Button>
            ) : (
              <Button variant="danger" onClick={() => setConfirm('suspend')}>
                <ShieldBan /> Suspend
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader title="Account" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 px-5 py-4 text-sm">
            <dt className="text-text-muted">Email</dt>
            <dd className="break-all text-text">
              {s.email ?? '—'}{' '}
              {s.email ? (
                <Badge tone={s.emailVerified ? 'success' : 'warning'}>
                  {s.emailVerified ? 'Verified' : 'Unverified'}
                </Badge>
              ) : null}
            </dd>
            <dt className="text-text-muted">Phone</dt>
            <dd className="text-text">{s.phone ?? '—'}</dd>
            <dt className="text-text-muted">App language</dt>
            <dd className="text-text">{s.locale === 'ne' ? 'नेपाली' : 'English'}</dd>
            <dt className="text-text-muted">Last sign-in</dt>
            <dd className="text-text">{formatDateTimeBs(s.lastLoginAt)}</dd>
          </dl>
          {can('users:update') ? (
            <form
              className="flex items-end gap-3 border-t border-border px-5 py-4"
              onSubmit={form.handleSubmit(({ override }) =>
                saveLimit.mutate(override ? Number(override) : null),
              )}
            >
              <Field
                label="Device limit override"
                hint="Empty uses the global setting."
                error={form.formState.errors.override?.message}
                className="flex-1"
              >
                {(a) => (
                  <Input
                    {...a}
                    {...form.register('override')}
                    inputMode="numeric"
                    placeholder="Global limit"
                  />
                )}
              </Field>
              <Button type="submit" variant="secondary" loading={saveLimit.isPending}>
                Save
              </Button>
            </form>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Signed-in devices"
            description={`${s.sessions.length} active session${s.sessions.length === 1 ? '' : 's'}`}
          />
          {s.sessions.length === 0 ? (
            <EmptyState title="No active sessions" description="The student is signed out on all devices." />
          ) : (
            <ul className="divide-y divide-border">
              {s.sessions.map((session) => (
                <li key={session.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div>
                    <p className="text-sm font-semibold text-text">{session.deviceName}</p>
                    <p className="text-xs text-text-muted">
                      {session.platform} · signed in {formatDateBs(session.createdAt)}
                    </p>
                  </div>
                  <span className="text-xs text-text-secondary">
                    Active {formatRelative(session.lastUsedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirm === 'suspend'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Suspend ${s.fullName}?`}
        description="They will be signed out on every device and cannot sign in until reactivated. This is recorded in the audit log."
        confirmLabel="Suspend account"
        onConfirm={async () => {
          await api.post(`/admin/users/${s.id}/suspend`);
          toast.success('Account suspended');
          await refresh();
        }}
      />
      <ConfirmDialog
        open={confirm === 'reactivate'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Reactivate ${s.fullName}?`}
        description="The student will be able to sign in again."
        confirmLabel="Reactivate"
        tone="primary"
        onConfirm={async () => {
          await api.post(`/admin/users/${s.id}/reactivate`);
          toast.success('Account reactivated');
          await refresh();
        }}
      />
      <ConfirmDialog
        open={confirm === 'revoke'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Sign out of every device?"
        description="All of this student's sessions end immediately. They can sign in again with their password."
        confirmLabel="Sign out everywhere"
        onConfirm={async () => {
          await api.post(`/admin/users/${s.id}/revoke-sessions`);
          toast.success('All sessions ended');
          await refresh();
        }}
      />
    </>
  );
}
