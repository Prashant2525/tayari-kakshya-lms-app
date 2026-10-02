import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Link,
  Outlet,
} from '@tanstack/react-router';
import { AppShell } from './components/layout/app-shell';
import { Button } from './components/ui/button';
import { EmptyState, ErrorState } from './components/ui/primitives';
import { LoginPage } from './features/auth/login-page';
import { ForgotPasswordPage, SetPasswordPage } from './features/auth/password-pages';
import { DashboardPage } from './features/dashboard/dashboard-page';

function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you are looking for does not exist or was moved."
      action={
        <Button asChild variant="secondary">
          <Link to="/">Go to dashboard</Link>
        </Button>
      }
    />
  );
}

function RouteError({ error, reset }: { error: unknown; reset: () => void }) {
  return <ErrorState error={error} onRetry={reset} />;
}

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFound });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (s: Record<string, unknown>): { next?: string; reset?: boolean } => ({
    next: typeof s['next'] === 'string' ? s['next'] : undefined,
    reset: s['reset'] === true || s['reset'] === 'true' ? true : undefined,
  }),
  component: LoginPage,
});

const forgotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
});

const setPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/set-password',
  validateSearch: (s: Record<string, unknown>): { email?: string; sent?: boolean } => ({
    email: typeof s['email'] === 'string' ? s['email'] : undefined,
    sent: s['sent'] === true || s['sent'] === 'true' ? true : undefined,
  }),
  component: SetPasswordPage,
});

const appRoute = createRoute({ getParentRoute: () => rootRoute, id: 'app', component: AppShell });

const routes = [
  createRoute({ getParentRoute: () => appRoute, path: '/', component: DashboardPage }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/students',
    component: lazyRouteComponent(() => import('./features/students/students-pages'), 'StudentsPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/students/$studentId',
    component: lazyRouteComponent(() => import('./features/students/students-pages'), 'StudentDetailPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/staff',
    component: lazyRouteComponent(() => import('./features/access/staff-page'), 'StaffPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/roles',
    component: lazyRouteComponent(() => import('./features/access/roles-pages'), 'RolesPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/roles/new',
    component: lazyRouteComponent(() => import('./features/access/roles-pages'), 'RoleEditorPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/roles/$roleId',
    component: lazyRouteComponent(() => import('./features/access/roles-pages'), 'RoleEditorPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/education-levels',
    component: lazyRouteComponent(
      () => import('./features/config/education-levels-page'),
      'EducationLevelsPage',
    ),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/settings',
    component: lazyRouteComponent(() => import('./features/config/settings-page'), 'SettingsPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/audit-log',
    component: lazyRouteComponent(() => import('./features/audit/audit-log-page'), 'AuditLogPage'),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: '/account',
    component: lazyRouteComponent(() => import('./features/account/account-page'), 'AccountPage'),
  }),
];

const routeTree = rootRoute.addChildren([
  loginRoute,
  forgotRoute,
  setPasswordRoute,
  appRoute.addChildren(routes),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultErrorComponent: RouteError,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
