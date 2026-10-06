import type { Permission } from '@tk/contracts';
import { Link, Navigate, Outlet, useRouterState } from '@tanstack/react-router';
import {
  Award,
  BookOpen,
  ClipboardCheck,
  Crown,
  TicketPercent,
  FileQuestion,
  FileText,
  Flag,
  PenLine,
  Receipt,
  FolderTree,
  GraduationCap,
  Library,
  Presentation,
  Images,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  ScrollText,
  Settings,
  ShieldCheck,
  Sun,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Alert, Avatar, Spinner } from '../ui/primitives';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
}

const NAV: Array<{ group: string; items: NavItem[] }> = [
  { group: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    group: 'Content',
    items: [
      { to: '/courses', label: 'Courses', icon: Library, permission: 'courses:edit' },
      { to: '/subjects', label: 'Subjects', icon: BookOpen, permission: 'content:edit' },
      { to: '/questions', label: 'Question bank', icon: FileQuestion, permission: 'questions:edit' },
      { to: '/assessments', label: 'Assessments', icon: ClipboardCheck, permission: 'assessments:edit' },
      { to: '/grading', label: 'Grading', icon: PenLine, permission: 'grading:manage' },
      { to: '/certificates', label: 'Certificates', icon: Award, permission: 'certificates:manage' },
      {
        to: '/question-reports',
        label: 'Question reports',
        icon: Flag,
        permission: 'question_reports:manage',
      },
      { to: '/categories', label: 'Exam categories', icon: FolderTree, permission: 'taxonomy:manage' },
      { to: '/category-types', label: 'Category types', icon: Layers, permission: 'taxonomy:manage' },
      { to: '/papers', label: 'Papers', icon: FileText, permission: 'taxonomy:manage' },
      { to: '/media', label: 'Media library', icon: Images, permission: 'media:manage' },
      { to: '/instructors', label: 'Instructors', icon: Presentation, permission: 'instructors:manage' },
    ],
  },
  {
    group: 'Sales',
    items: [
      { to: '/plans', label: 'Plans', icon: Crown, permission: 'plans:manage' },
      { to: '/coupons', label: 'Coupons', icon: TicketPercent, permission: 'coupons:manage' },
      { to: '/orders', label: 'Orders', icon: Receipt, permission: 'orders:read' },
    ],
  },
  {
    group: 'People',
    items: [
      { to: '/students', label: 'Students', icon: Users, permission: 'users:read' },
      { to: '/staff', label: 'Staff', icon: UserCog, permission: 'staff:read' },
      { to: '/roles', label: 'Roles & permissions', icon: ShieldCheck, permission: 'roles:manage' },
    ],
  },
  {
    group: 'Configuration',
    items: [
      {
        to: '/education-levels',
        label: 'Education levels',
        icon: GraduationCap,
        permission: 'education_levels:manage',
      },
      { to: '/settings', label: 'System settings', icon: Settings, permission: 'settings:read' },
    ],
  },
  {
    group: 'Security',
    items: [{ to: '/audit-log', label: 'Audit log', icon: ScrollText, permission: 'audit:read' }],
  },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span className="grid size-9 place-items-center rounded-md bg-brand text-sm font-bold text-on-brand">
        TK
      </span>
      <div className="leading-tight">
        <p className="text-[15px] font-bold text-text">Tayari Kakshya</p>
        <p className="text-xs text-text-muted">Admin</p>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5">
      <Brand />
      {NAV.map(({ group, items }) => {
        const visible = items.filter((i) => !i.permission || can(i.permission));
        if (visible.length === 0) return null;
        return (
          <div key={group}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              {group}
            </p>
            <ul className="flex flex-col gap-0.5">
              {visible.map((item) => {
                const active = item.to === '/' ? path === '/' : path.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors duration-150',
                        active
                          ? 'bg-primary-soft text-on-primary-soft'
                          : 'text-text-secondary hover:bg-surface-muted hover:text-text',
                      )}
                    >
                      <Icon className="size-[18px]" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function ThemeMenuItems() {
  const [pref, setPref] = useTheme();
  const options = [
    { value: 'system', label: 'System theme', icon: Monitor },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
  ] as const;
  return (
    <DropdownMenu.RadioGroup value={pref} onValueChange={(v) => setPref(v as typeof pref)}>
      {options.map(({ value, label, icon: Icon }) => (
        <DropdownMenu.RadioItem key={value} value={value} className={menuItem}>
          <Icon className="size-4" aria-hidden /> {label}
          <DropdownMenu.ItemIndicator className="ml-auto text-primary">●</DropdownMenu.ItemIndicator>
        </DropdownMenu.RadioItem>
      ))}
    </DropdownMenu.RadioGroup>
  );
}

const menuItem =
  'flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-2 text-sm text-text outline-none data-[highlighted]:bg-surface-muted';

function UserMenu() {
  const { me, logout } = useAuth();
  if (!me) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-left hover:bg-surface-muted"
          aria-label="Account menu"
        >
          <Avatar name={me.fullName} />
          <span className="hidden leading-tight sm:block">
            <span className="block text-sm font-semibold text-text">{me.fullName}</span>
            <span className="block text-xs text-text-muted">{me.isSuperAdmin ? 'Super Admin' : 'Staff'}</span>
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-56 rounded-md border border-border bg-surface-raised p-1 shadow-e2"
        >
          <div className="px-2.5 py-2">
            <p className="text-sm font-semibold text-text">{me.fullName}</p>
            <p className="text-xs text-text-muted">{me.email}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item asChild className={menuItem}>
            <Link to="/account">
              <UserCog className="size-4" aria-hidden /> My account & security
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <ThemeMenuItems />
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item className={cn(menuItem, 'text-danger')} onSelect={() => void logout()}>
            <LogOut className="size-4" aria-hidden /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Authenticated layout. Redirects to login, and confines staff who must set up 2FA to their account page. */
export function AppShell() {
  const { status, me } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  // The mobile menu belongs to the page it was opened on, so navigating closes it.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === path;
  const setMenuOpen = (open: boolean) => setMenuPath(open ? path : null);

  if (status === 'loading') return <Spinner label="Loading your workspace" />;
  if (status !== 'authenticated' || !me) return <Navigate to="/login" search={{ next: path }} />;
  if (me.mfaSetupRequired && path !== '/account') return <Navigate to="/account" />;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-border bg-surface lg:block">
        <Sidebar />
      </aside>
      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-[rgba(11,18,32,0.45)]"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="relative h-full w-72 border-r border-border bg-surface shadow-e3">
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
          <div className="flex-1" />
          <UserMenu />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
          {me.mfaSetupRequired ? (
            <div className="mb-6">
              <Alert tone="warning" title="Two-factor authentication is required for your account">
                Set it up below to unlock the rest of the admin panel.
              </Alert>
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
