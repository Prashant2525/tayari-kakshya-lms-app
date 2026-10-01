import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, ShieldCheck, ShieldAlert, UserPlus, Users, UserX, type LucideIcon } from 'lucide-react';
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
          <CardHeader
            title="What's next"
            description="Content, exams and commerce modules are added in the next phases."
          />
          <ul className="space-y-2 px-5 py-4 text-sm text-text-secondary">
            <li>Exam categories, courses, subjects, notes and videos (Phase 6)</li>
            <li>Question bank, quizzes and mock/weekly exams (Phase 7)</li>
            <li>Plans, payments with eSewa and Khalti (Phase 11)</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
