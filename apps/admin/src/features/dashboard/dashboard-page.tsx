import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { Permission } from '@tk/contracts';
import {
  ArrowRight,
  ChartColumn,
  ClipboardCheck,
  FileQuestion,
  Library,
  Megaphone,
  PenLine,
  Receipt,
  ShieldCheck,
  ShieldAlert,
  UserPlus,
  Users,
  UserX,
  type LucideIcon,
  Send,
} from 'lucide-react';
import { Card, CardHeader, ErrorState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Dashboard {
  students: number;
  activeStudentsLast7Days: number;
  newStudentsLast7Days: number;
  suspended: number;
  pendingDeletion: number;
  staff: number;
}

function Stat({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value?: number;
  icon: LucideIcon;
  hint?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        <span className="grid size-9 place-items-center rounded-sm bg-primary-soft text-on-primary-soft">
          <Icon className="size-[18px]" aria-hidden />
        </span>
      </div>
      {value === undefined ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <p className="mt-2 text-[28px] font-bold leading-9 tabular-nums text-text">
          {value.toLocaleString('en-IN')}
        </p>
      )}
      {hint ? <p className="mt-1 text-xs text-text-muted">{hint}</p> : null}
    </Card>
  );
}

/** Shortcuts shown to staff who may open them (replaces the build-phase placeholder, audit F-01). */
const QUICK_LINKS: Array<{ to: string; label: string; icon: LucideIcon; permissions: Permission[] }> = [
  { to: '/courses', label: 'Courses', icon: Library, permissions: ['courses:edit'] },
  { to: '/questions', label: 'Question bank', icon: FileQuestion, permissions: ['questions:edit'] },
  { to: '/assessments', label: 'Assessments', icon: ClipboardCheck, permissions: ['assessments:edit'] },
  { to: '/grading', label: 'Grading', icon: PenLine, permissions: ['grading:manage'] },
  { to: '/notices', label: 'Notices', icon: Megaphone, permissions: ['notices:edit'] },
  { to: '/campaigns', label: 'Campaigns', icon: Send, permissions: ['campaigns:send'] },
  { to: '/orders', label: 'Orders', icon: Receipt, permissions: ['orders:read'] },
  { to: '/students', label: 'Students', icon: Users, permissions: ['users:read'] },
  {
    to: '/reports',
    label: 'Reports',
    icon: ChartColumn,
    permissions: ['orders:read', 'users:read', 'courses:edit', 'assessments:edit'],
  },
];

export function DashboardPage() {
  const { me, can } = useAuth();
  const stats = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Dashboard>('/admin/dashboard'),
    enabled: can('users:read'),
  });
  const firstName = me?.fullName.split(' ')[0] ?? '';

  return (
    <>
      <PageHeader
        title={`Namaste, ${firstName}`}
        description="Here is what is happening on Tayari Kakshya."
      />

      {can('users:read') ? (
        stats.isError ? (
          <Card>
            <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Students" value={stats.data?.students} icon={Users} hint="All registered accounts" />
            <Stat
              label="Active this week"
              value={stats.data?.activeStudentsLast7Days}
              icon={ShieldCheck}
              hint="Signed in during the last 7 days"
            />
            <Stat
              label="New this week"
              value={stats.data?.newStudentsLast7Days}
              icon={UserPlus}
              hint="Registered in the last 7 days"
            />
            <Stat
              label="Suspended / leaving"
              value={stats.data ? stats.data.suspended + stats.data.pendingDeletion : undefined}
              icon={UserX}
              hint={stats.data ? `${stats.data.pendingDeletion} scheduled for deletion` : undefined}
            />
          </div>
        )
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Your account security"
            description="Two-factor authentication protects the admin panel."
          />
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-3">
              {me?.mfaEnabled ? (
                <ShieldCheck className="size-6 text-success" aria-hidden />
              ) : (
                <ShieldAlert className="size-6 text-warning" aria-hidden />
              )}
              <p className="text-sm text-text">
                {me?.mfaEnabled ? 'Two-factor authentication is on.' : 'Two-factor authentication is off.'}
              </p>
            </div>
            <Link
              to="/account"
              className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline"
            >
              Manage <ArrowRight className="size-4" />
            </Link>
          </div>
        </Card>
        <Card>
          <CardHeader title="Quick links" description="The places staff open most." />
          <ul className="grid gap-1 px-3 py-3 sm:grid-cols-2">
            {QUICK_LINKS.filter((l) => l.permissions.some(can)).map((l) => (
              <li key={l.to}>
                <Link
                  to={l.to}
                  className="flex items-center gap-2 rounded-sm px-2 py-2 text-sm font-medium text-text hover:bg-surface-muted"
                >
                  <l.icon className="size-4 text-text-muted" aria-hidden />
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
